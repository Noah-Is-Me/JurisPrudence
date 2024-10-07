import fetch from "node-fetch";
import dotenv from "dotenv";
import { parseStringPromise } from "xml2js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();
const congress_api_key = process.env.CONGRESS_API_KEY;


/*
    Types of laws:
    "pub"  :  Public Law
    "priv" :  Private Law
*/

// TODO: ALL UNCALLED FUNCTIONS ARE NOT TESTED. THEY MIGHT NOT WORK.


async function fetchLaw(congress, lawType, lawNumber) {
    try {
        const response = await fetch(`https://api.congress.gov/v3/law/${congress}/${lawType}/${lawNumber}?api_key=${congress_api_key}`);

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

async function fetchBillDetails(congress, billType, billNumber, details) {
    try {
        const response = await fetch(`https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}/${details}?api_key=${congress_api_key}`);

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

function extractLawRequestData(lawData) {
    const requestLawData = lawData.bill.laws[0];
    const parts = requestLawData.number.split("-");

    const requestData = {
        congress: parseInt(lawData.request.congress),
        lawType: (requestLawData.type == "Public Law" ? "pub" : "priv"),
        lawNumber: parseInt(parts[1]),
        billType: lawData.request.billType,
        billNumber: parseInt(lawData.request.billNumber)
    }

    return requestData;
}

function extractBillRequestData(billData) {
    const requestData = {
        congress: billData.request.congress,
        billType: billData.request.billType,
        billNumber: billData.request.billNumber,
    }

    return requestData;
}

export async function fetchVotes(congress, billType, billNumber) {
    const billActions = await fetchBillDetails(congress, billType, billNumber, "actions");
    const voteActions = billActions.actions.filter(action => action.recordedVotes);

    const houseRecordedVotes = voteActions.find(obj => obj.recordedVotes[0].chamber == "House") || null;
    const senateRecordedVotes = voteActions.find(obj => obj.recordedVotes[0].chamber == "Senate") || null;

    let houseVote = null;
    let senateVote = null;

    if (houseRecordedVotes == null) {
        if (billActions.actions.some(obj => obj.text.toLowerCase().includes("passed house") && obj.text.toLowerCase().includes("unanimous consent"))) {
            houseVote = "unanimous";
        }
    } else {
        const url = houseRecordedVotes.recordedVotes[0].url;
        const rollCallsXml = await fetchXmlFromUrl(url);
        const rollCallsJson = await xmlToJson(rollCallsXml);

        const members = {
            chamber: "house",
            members: rollCallsJson["rollcall-vote"]["vote-data"]
        };

        if (members == null) {
            console.error(`${congress}, ${billType}, ${billNumber} ; null return house`);
        }
        /*else {
            console.log(`${congress}, ${billType}, ${billNumber} ; successful return 2`);
        }*/
        houseVote = members;
    }

    if (senateRecordedVotes == null) {
        if (billActions.actions.some(obj => obj.text.toLowerCase().includes("passed senate") && obj.text.toLowerCase().includes("unanimous consent"))) {
            senateVote = "unanimous";
        }
    } else {
        const url = senateRecordedVotes.recordedVotes[0].url;
        const rollCallsXml = await fetchXmlFromUrl(url);
        const rollCallsJson = await xmlToJson(rollCallsXml);

        const members = {
            chamber: "senate",
            members: rollCallsJson.roll_call_vote.members[0].member
        };

        if (members == null) {
            console.error(`${congress}, ${billType}, ${billNumber} ; null return senate`);
        }
        /*else {
            console.log(`${congress}, ${billType}, ${billNumber} ; successful return 1`);
        }*/
        senateVote = members;
    }

    const voteData = {
        houseVote,
        senateVote
    }
    return voteData;
}

async function getRemainingRequests() {
    try {
        const response = await fetch(`https://api.congress.gov/v3/bill?limit=1&api_key=${congress_api_key}`);

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const headers = response.headers;
        const remainingRequests = headers.get("X-RateLimit-Remaining");
        const requestLimit = headers.get("X-RateLimit-Limit");

        console.log("Remaining requests:  " + remainingRequests + ";  Request limit: " + requestLimit);
        return remainingRequests;

    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}


async function extractFullText(lawTextData) {
    const textVersions = lawTextData.textVersions;

    let allVersionTexts = [];
    for (const version of textVersions) {
        const url = version.formats[2].url;
        const fullXml = await fetchXmlFromUrl(url);
        const fullJson = await xmlToJson(fullXml);
        if ("bill" in fullJson) {
            const relevantJson = fullJson.bill["legis-body"];
            const rawText = await toRawText(relevantJson);
            allVersionTexts.push(rawText);
        }
    }

    return allVersionTexts;
}

async function fetchSummary(congress, billType, billNumber) {
    const summariesData = await fetchBillDetails(congress, billType, billNumber, "summaries");
    const summaries = summariesData.summaries;

    if (summaries.length == 0) {
        return null;
    }

    const finalSummary = summaries[summaries.length - 1];
    let text = await toRawText(finalSummary.text);
    if (text.length > 2000) {
        text = text.slice(0, 2000) + "...";
    }
    return text;
}

async function toRawText(obj) {
    let text = '';

    if (typeof obj === 'string') {
        return obj.trim().replace(/<\/?[^>]+(>|$)/g, "");
    }

    if (typeof obj === 'object') {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                text += await toRawText(obj[key]) + ' ';
            }
        }
    }

    return text.trim().replace(/<\/?[^>]+(>|$)/g, "");
}


async function fetchXmlFromUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const xml = await response.text();
        return xml;

    } catch (error) {
        console.error("Error fetching or parsing data", error);
    }
}

async function xmlToJson(xml) {
    const json = await parseStringPromise(xml);
    return json;
}



async function fetchAndStoreLaw(congress, lawType, lawNumber) {
    const lawData = await fetchLaw(congress, lawType, lawNumber);
    const requestData = extractLawRequestData(lawData);
    const lawVotes = await fetchVotes(requestData.congress, requestData.lawType, requestData.lawNumber);
    if (lawVotes == 0 || lawVotes == null) return;

    const lawSummary = await fetchSummary(requestData.congress, requestData.lawType, requestData.lawNumber);

    storeLaw(lawData, lawSummary, lawVotes);
}

async function fetchAndStoreLaws(congress, startingLaw, lawCount) {
    const laws = (await fetchLaws(congress, startingLaw, lawCount)).bills;
    let lawsData = [];

    for (const law of laws) {
        const url = law.url;
        try {
            const response = await fetch(`${url}&api_key=${congress_api_key}`);
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }

            const lawData = await response.json();

            //console.log("Law data:");
            //console.log(lawData);

            const requestData = extractLawRequestData(lawData);
            //const lawVotes = await fetchVotes(requestData.congress, requestData.billType, requestData.billNumber);
            //if (lawVotes == 0 || lawVotes == null) continue;


            const lawSummary = await fetchSummary(requestData.congress, requestData.billType, requestData.billNumber);
            if (lawSummary == null) continue;

            const shortenedData = {
                title: lawData.bill.title,
                date: lawData.bill.latestAction.actionDate,
                summary: lawSummary,
                //votes: lawVotes
            }

            const lawJson = {
                lawData: shortenedData,
                requestData: requestData
            }

            //console.log(lawVotes.members[0]["recorded-vote"]);

            lawsData.push(lawJson);

        } catch (error) {
            console.error("Error fetching data:", error);
            return null;
        }
    }

    if (lawsData.length > 0) {
        storeLaws(lawsData);
    }

    return lawsData.length;
}


function storeLaw(lawData, lawSummary, lawVotes) {
    const lawJson = {
        lawData: lawData,
        lawSummary: lawSummary,
        lawVotes: lawVotes
    }
    //const stringifiedLaw = JSON.stringify(lawJson, null, 2);


    const filePath = path.join(__dirname, "lawData.json");
    fs.readFile(filePath, 'utf8', function (error, data) {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)
        jsonData.laws.push(lawJson);

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), function (error) {
            if (error) {
                console.error("error writing file: ", error);
            }
        });
    });
}

function storeLaws(lawsData) {
    const filePath = path.join(__dirname, "lawData.json");
    fs.readFile(filePath, 'utf8', function (error, data) {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)

        for (const lawJson of lawsData) {
            jsonData.laws.push(lawJson);
        }

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), function (error) {
            if (error) {
                console.error("error writing file: ", error);
            }
        });
    });
}


async function fetchLaws(congress, startingLaw, lawCount) {
    try {
        const response = await fetch(`https://api.congress.gov/v3/law/${congress}?format=json&offset=${startingLaw}&limit=${lawCount}&api_key=${congress_api_key}`);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        return await response.json();

    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

async function fetchNewBills(startingLaw, billCount) {
    try {
        const response = await fetch(`https://api.congress.gov/v3/bill?format=json&offset=${startingLaw}&limit=${billCount}&api_key=${congress_api_key}`);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        return await response.json();

    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

function CLEAR_LAWDATA_JSON(verification) {
    if (verification == "I AM SURE I WANT TO DELETE ALL OF THE DATA IN LAWDATA.JSON!") {
        const filePath = path.join(__dirname, "lawData.json");
        fs.readFile(filePath, 'utf8', function (error, data) {
            if (error) {
                console.error("Error reading file: ", error);
                return null;
            }

            let jsonData = JSON.parse(data)
            jsonData.laws.length = 0;

            fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), function (error) {
                if (error) {
                    console.error("error writing file: ", error);
                }
            });
            console.log("Alert: lawData.json emptied!")
        });
    }
    else {
        console.error("PLEASE DO NOT DELETE THE LAW DATA IF YOU ARE NOT SURE WHAT YOU ARE DOING!!!");
    }
}

function getLawDataJsonLength() {
    const filePath = path.join(__dirname, "lawData.json");
    fs.readFile(filePath, 'utf8', function (error, data) {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        const jsonData = JSON.parse(data)
        console.log(`LawData.json length: ${jsonData.laws.length} laws.`)
    });
}


async function storeAllLaws(congress) {
    for (let i = 0; i < 100; i++) {
        const numLaws = await fetchAndStoreLaws(congress, 250 * i, 250);
        if (numLaws < 250) return;
    }

    console.error("Never broke loop??? I will throw my computer down a storm drain");
}


export async function getRandomCachedLaw() {
    const filePath = path.join(__dirname, "lawData.json");

    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        const laws = jsonData.laws;
        const law = laws[Math.floor(Math.random() * laws.length)];
        return law;
    } catch (error) {
        console.error("Error reading file: ", error);
        return null;
    }
}

export async function getCachedLaw(index) {
    const filePath = path.join(__dirname, "lawData.json");

    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        const laws = jsonData.laws;
        const law = laws[index];
        return law;
    } catch (error) {
        console.error("Error reading file: ", error);
        return null;
    }
}

export async function getAllCachedLaws() {
    const filePath = path.join(__dirname, "lawData.json");

    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        const laws = jsonData.laws;
        return laws;
    } catch (error) {
        console.error("Error reading file: ", error);
        return null;
    }
}

export async function getLawFromJson(congress, billType, billNumber) {
    const filePath = path.join(__dirname, "lawData.json");

    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        const laws = jsonData.laws;

        const found = laws.find(law =>
            law.requestData.congress == congress &&
            law.requestData.billType == billType &&
            law.requestData.billNumber == billNumber
        );

        if (!found) return null;

        return found;

    } catch (error) {
        console.error("Error reading file: ", error);
        return null;
    }
}

export function getRepresentativeVote(voteData, representative, repType) {
    //console.log(JSON.stringify(voteData.houseVote));
    //console.log(voteData.houseVote);

    if (repType == "house") {
        const houseVote = voteData.houseVote;

        if (houseVote == null) {
            return "Voting data unavailable.";
        }

        if (houseVote == "unanimous") {
            return "Yea (unanimous)";
        }

        const repVotes = houseVote.members[0]["recorded-vote"].filter(member => member.legislator[0]["_"].toLowerCase() == representative.toLowerCase());
        if (repVotes.length > 0) {
            return repVotes[0].vote[0];
        }

        console.log("Error! House representative not found or something.");
        return "Vote data unavailable."
    }

    else if (repType == "senate") {
        const senateVote = voteData.senateVote;

        if (senateVote == null) {
            return "Voting data unavailable.";
        }

        if (senateVote == "unanimous") {
            return "Yea (unanimous)";
        }

        const repVotes = senateVote.members.filter(member => member.last_name[0].toLowerCase() == representative.toLowerCase());
        if (repVotes.length > 0) {
            return repVotes[0].vote_cast[0];
        }

        console.log("Error! House representative not found or something.");
        return "Vote data unavailable."
    }

    // TODO: This system is bad because if the vote is unanimous, it says the representative voted Yea even if they weren't in Congress at the time.


    console.error("Error: Invalid repType: " + repType + "!");
    return null;
}

export function getRepresentativesVote(voteData, repData) {
    const houseRep = repData.houseRep;
    const senateRep1 = repData.senateRep1;
    const senateRep2 = repData.senateRep2;

    const houseVote = voteData.houseVote;
    const senateVote = voteData.senateVote;

    //console.log(JSON.stringify(houseVote));

    let votes = {
        houseVote: null,
        senateVote1: null,
        senateVote2: null
    };


    houseBlock: { // I want to break out of this scope
        if (houseVote == null) {
            votes.houseVote = "Voting data unavailable.";
            break houseBlock;
        }

        if (houseVote == "unanimous") {
            votes.houseVote = "Yea (unanimous)";
            break houseBlock;
        }

        const repVotes = houseVote.members[0]["recorded-vote"].filter(member => member.legislator[0]["_"].toLowerCase() == houseRep.toLowerCase());
        if (repVotes.length > 0) {
            votes.houseVote = repVotes[0].vote[0];
        }
        else {
            console.log("Error! House representative not found or something.");
            votes.houseVote = "Vote data unavailable.";
        }
    }


    senateBlock: {
        if (senateVote == null) {
            votes.senateVote1 = "Voting data unavailable.";
            votes.senateVote2 = "Voting data unavailable.";
            break senateBlock;
        }

        if (senateVote == "unanimous") {
            votes.senateVote1 = "Yea (unanimous)";
            votes.senateVote2 = "Yea (unanimous)";
            break senateBlock;
        }

        const repVotes = senateVote.members.filter(member =>
            member.last_name[0].toLowerCase() == senateRep1.toLowerCase() ||
            member.last_name[0].toLowerCase() == senateRep2.toLowerCase()
        );

        if (repVotes.length > 0) {
            if (repVotes[0].last_name == senateRep1.toLowerCase()) {
                votes.senateVote1 = repVotes[0].vote_cast[0];
            } else {
                votes.senateVote2 = repVotes[0].vote_cast[0];
            }

            if (repVotes.length > 1) {
                if (votes.senateVote1 == null) {
                    votes.senateVote1 = repVotes[1].vote_cast[0];
                } else {
                    votes.senateVote2 = repVotes[1].vote_cast[0];
                }
            }
            else {
                if (votes.senateVote1 == null) {
                    console.log("Error! Senate representative not found or something. Trigger 1.");
                    votes.senateVote1 = "Vote data unavailable.";
                } else {
                    console.log("Error! Senate representative not found or something. Trigger 2.");
                    votes.senateVote2 = "Vote data unavailable.";
                }
            }
        }
        else {
            console.log("Error! Senate representative not found or something.");
            votes.senateVote1 = "Vote data unavailable.";
            votes.senateVote2 = "Vote data unavailable.";
        }
    }

    // TODO: This system is bad because if the vote is unanimous, it says the representative voted Yea even if they weren't in Congress at the time.
    return votes;
}

export function analyzeVotes(voteData, repData) {

    let votes = {
        houseVote: null,
        senateVote1: null,
        senateVote2: null
    };

    let voteBreakdown = {
        senate: {
            democratic: {
                yes: 0,
                no: 0,
                "p/nv": 0
            },
            republican: {
                yes: 0,
                no: 0,
                "p/nv": 0
            },
            independent: {
                yes: 0,
                no: 0,
                "p/nv": 0
            },
            total: {
                yes: 0,
                no: 0,
                "p/nv": 0
            }
        },
        house: {
            democratic: {
                yes: 0,
                no: 0,
                "p/nv": 0
            },
            republican: {
                yes: 0,
                no: 0,
                "p/nv": 0
            },
            independent: {
                yes: 0,
                no: 0,
                "p/nv": 0
            },
            total: {
                yes: 0,
                no: 0,
                "p/nv": 0
            }
        }
    }

    if (voteData == null) {
        for (let chamber in voteBreakdown) {
            for (let party in voteBreakdown[chamber]) {
                for (let prop in voteBreakdown[chamber][party]) {
                    voteBreakdown[chamber][party][prop] = "N/A";
                }
            }
        }

        return {
            voteData: {
                houseVote: "No vote data available (API error)",
                senateVote1: "No vote data available (API error)",
                senateVote2: "No vote data available (API error)"
            },
            voteBreakdown
        };
    }

    const houseRep = repData.houseRep;
    const senateRep1 = repData.senateRep1;
    const senateRep2 = repData.senateRep2;

    const houseVote = voteData.houseVote;
    const senateVote = voteData.senateVote;



    houseBlock: { // I want to break out of this scope
        if (houseVote == null) {
            votes.houseVote = "Vote data unavailable.";

            for (let party in voteBreakdown.house) {
                for (let prop in voteBreakdown.house[party]) {
                    voteBreakdown.house[party][prop] = "N/A";
                }
            }

            break houseBlock;
        }

        if (houseVote == "unanimous") {
            votes.houseVote = "Yea (unanimous)";

            for (let party in voteBreakdown.house) {
                for (let prop in voteBreakdown.house[party]) {
                    voteBreakdown.house[party][prop] = "N/A";
                }
            }
            voteBreakdown.house.total.yes == 435;

            break houseBlock;
        }

        let repVotes = [];
        for (let member of houseVote.members[0]["recorded-vote"]) {
            if (member.legislator[0]["_"].toLowerCase() == houseRep.toLowerCase()) {
                repVotes.push(member);
            }

            let party;
            switch (member.legislator[0]["$"].party) {
                case "D":
                    party = "democratic";
                    break;
                case "R":
                    party = "republican";
                    break;
                default:
                    party = "independent";
            }

            switch (member.vote[0]) {
                case "Yea":
                case "Aye":
                    voteBreakdown.house[party].yes++;
                    voteBreakdown.house.total.yes++;
                    break;
                case "Nay":
                case "No":
                    voteBreakdown.house[party].no++;
                    voteBreakdown.house.total.no++;
                    break;
                default:
                    voteBreakdown.house[party]["p/nv"]++;
                    voteBreakdown.house.total["p/nv"]++;
                    break;
            }
        }

        if (repVotes.length > 0) {
            votes.houseVote = repVotes[0].vote[0];
        }
        else {
            console.log("Error! House representative not found or something.");
            votes.houseVote = "Vote data unavailable.";
        }
    }


    senateBlock: {
        if (senateVote == null) {
            votes.senateVote1 = "Vote data unavailable.";
            votes.senateVote2 = "Vote data unavailable.";

            for (let party in voteBreakdown.senate) {
                for (let prop in voteBreakdown.senate[party]) {
                    voteBreakdown.senate[party][prop] = "N/A";
                }
            }

            break senateBlock;
        }

        if (senateVote == "unanimous") {
            votes.senateVote1 = "Yea (unanimous)";
            votes.senateVote2 = "Yea (unanimous)";

            for (let party in voteBreakdown.senate) {
                for (let prop in voteBreakdown.senate[party]) {
                    voteBreakdown.senate[party][prop] = "N/A";
                }
            }

            voteBreakdown.house.total.yes == 100;

            break senateBlock;
        }

        let repVotes = [];
        for (let member of senateVote.members) {
            if (member.last_name[0].toLowerCase() == senateRep1.toLowerCase() ||
                member.last_name[0].toLowerCase() == senateRep2.toLowerCase()) {

                repVotes.push(member);
            }

            let party;
            switch (member.party[0]) {
                case "D":
                    party = "democratic";
                    break;
                case "R":
                    party = "republican";
                    break;
                default:
                    party = "independent";
            }

            switch (member["vote_cast"][0]) {
                case "Yea":
                case "Aye":
                    voteBreakdown.senate[party].yes++;
                    voteBreakdown.senate.total.yes++;
                    break;
                case "Nay":
                case "No":
                    voteBreakdown.senate[party].no++;
                    voteBreakdown.senate.total.no++;
                    break;
                default:
                    voteBreakdown.senate[party]["p/nv"]++;
                    voteBreakdown.senate.total["p/nv"]++;
                    break;
            }
        }

        if (repVotes.length > 0) {
            if (repVotes[0].last_name == senateRep1.toLowerCase()) {
                votes.senateVote1 = repVotes[0].vote_cast[0];
            } else {
                votes.senateVote2 = repVotes[0].vote_cast[0];
            }

            if (repVotes.length > 1) {
                if (votes.senateVote1 == null) {
                    votes.senateVote1 = repVotes[1].vote_cast[0];
                } else {
                    votes.senateVote2 = repVotes[1].vote_cast[0];
                }
            }
            else {
                if (votes.senateVote1 == null) {
                    console.log("Error! Senate representative not found or something. Trigger 1.");
                    votes.senateVote1 = "Vote data unavailable.";
                } else {
                    console.log("Error! Senate representative not found or something. Trigger 2.");
                    votes.senateVote2 = "Vote data unavailable.";
                }
            }
        }
        else {
            console.log("Error! Senate representative not found or something.");
            votes.senateVote1 = "Vote data unavailable.";
            votes.senateVote2 = "Vote data unavailable.";
        }
    }

    // TODO: This system is bad because if the vote is unanimous, it says the representative voted Yea even if they weren't in Congress at the time.
    return { voteData: votes, voteBreakdown };
}


export async function getNewLaws() {
    let newLaws = [];

    fetchLoop:
    for (let i = 0; i < 100; i++) {
        //console.log(i + " fetching");
        const data = await fetchNewBills(250 * i, 250);
        //console.log(i + " fetched");
        if (!data) {
            console.log("null return");
            break;
        }

        if (data.bills.length == 0) {
            console.log("zero bills");
            console.log(data);
        }

        for (const bill of data.bills) {

            const latestAction = bill.latestAction.text.toLowerCase();
            if (!latestAction.includes("became public law") && !latestAction.includes("signed by president")) {
                //console.log("not a law continue");
                continue;
            }

            const url = bill.url;
            try {
                const response = await fetch(`${url}&api_key=${congress_api_key}`);
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                const billData = await response.json();

                const requestData = extractBillRequestData(billData);

                const found = await getLawFromJson(requestData.congress, requestData.billType, requestData.billNumber);
                if (found == null) {
                    const lawSummary = await fetchSummary(requestData.congress, requestData.billType, requestData.billNumber);
                    if (lawSummary == null) {
                        //console.log("no summary continue");
                        continue;
                    }

                    const shortenedData = {
                        title: billData.bill.title,
                        date: billData.bill.latestAction.actionDate,
                        summary: lawSummary,
                    }

                    const lawJson = {
                        lawData: shortenedData,
                        requestData: requestData
                    }

                    newLaws.push(lawJson);
                }
                else {
                    //console.log("broke loop");
                    //console.log(billData);
                    //console.log(requestData);
                    break fetchLoop;
                };


            } catch (error) {
                console.error("Error fetching data:", error);
                continue;
            }
        }

        if (data.bills.length < 250) break fetchLoop;
    }

    //console.log(newLaws);
    //console.log(newLaws.length);

    storeLaws(newLaws);

    //await getRemainingRequests();
    return newLaws;
}

/*
export function getRepresentativeVotes(voteData, state, district) {
    const houseVote = voteData.houseVote;
    const senateVote = voteData.senateVote;


    let votes = {
        "houseRep": {
            "name": null,
            "vote": null,
        },
        "senateRep1": {
            "name": null,
            "vote": null,
        },
        "senateRep2": {
            "name": null,
            "vote": null,
        }
    }

    if (houseVote == null) {
        votes.houseRep.name = "Representative data unavailable.";
        votes.houseRep.vote = "Voting data unavailable.";
    }
    else if (houseVote == "unanimous") {
        votes.houseRep.name = "Representative data unavailable.";
        votes.houseRep.vote = "Yea (unanimous)";
    }
    else {
        const repVotes = houseVote.members[0]["recorded-vote"].filter(member => member.legislator[0]["_"].toLowerCase() == representative.toLowerCase());
        if (repVotes.length > 0) {
            votes.houseRep.name = repVotes[0].legislator[0]["_"];
            votes.houseRep.vote = repVotes[0].vote[0];
        } else {
            console.error("Error! House representative not found or something.");
        }
    }

    if (senateVote == null) {
        votes.senateRep1.name = "Representative data unavailable.";
        votes.senateRep1.vote = "Voting data unavailable.";

        votes.senateRep2.name = "Representative data unavailable.";
        votes.senateRep2.vote = "Voting data unavailable.";
    }
    else if (senateVote == "unanimous") {
        votes.senateRep1.name = "Representative data unavailable.";
        votes.senateRep1.vote = "Yea (unanimous)";

        votes.senateRep2.name = "Representative data unavailable.";
        votes.senateRep2.vote = "Yea (unanimous)";
    }
    else {
        const repVotes = senateVote.members.filter(member => member.state[0].toLowerCase() == state.toLowerCase());
        if (repVotes.length > 0) {
            votes.senateRep1.name = repVotes[0].firstName[0] + " " + repVotes[0].last_name[0];
            votes.senateRep1.vote = repVotes[0].vote_cast[0];
            if (repVotes.length > 1) {
                votes.senateRep2.name = repVotes[1].firstName[0] + " " + repVotes[1].last_name[0];
                votes.senateRep2.vote = repVotes[1].vote_cast[0];
            }
        } else {
            console.error("Error! Senate representative not found or something.");
        }
    }

    return votes;
}
*/


//console.log(await getRandomCachedLaw());

//await storeAllLaws(117);
//await getRemainingRequests();
//await getNewLaws();
//await getRemainingRequests();

//console.log("done");
//getLawDataJsonLength();

//CLEAR_LAWDATA_JSON("I AM SURE I WANT TO DELETE ALL OF THE DATA IN LAWDATA.JSON!");

//const law = await getLawFromJson(118, "pub", 34);