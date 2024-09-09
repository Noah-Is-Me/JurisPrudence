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

function extractRequestData(lawData) {
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

async function fetchVotes(congress, billType, billNumber) {
    const billActions = await fetchBillDetails(congress, billType, billNumber, "actions");
    const voteActions = billActions.actions.filter(action => action.recordedVotes);

    if (voteActions.length == 0) {
        return null;
    }

    const recordedVotes = voteActions[0].recordedVotes[0];
    const url = recordedVotes.url;
    const rollCallsXml = await fetchXmlFromUrl(url);
    const rollCallsJson = await xmlToJson(rollCallsXml);

    if ("roll_call_vote" in rollCallsJson) {
        // newer json format?
        const members = {
            jsonFormat: "new",
            members: rollCallsJson.roll_call_vote.members[0].member
        };

        return members;
    }
    else if ("rollcall-vote" in rollCallsJson) {
        // older json format?
        const members = {
            jsonFormat: "old",
            members: rollCallsJson["rollcall-vote"]["vote-data"]
        };

        return members;
    }
    else {
        console.log(rollCallsJson);
        console.error(`Unknown vote json format for bill: ${congress}-${billType}-${billNumber}!`);
        return null;
    }
    /*
    let allMembersAllVotes = [];
    for (const action of voteActions) {
        for (const vote of action.recordedVotes) {
            const url = vote.url;
            const rollCallsXml = await fetchXmlFromUrl(url);
            const rollCallsJson = await xmlToJson(rollCallsXml);
            const members = rollCallsJson.roll_call_vote.members[0].member;
            allMembersAllVotes.push(members);
        }
    }
    */
}

async function getRemainingRequests() {
    try {
        const response = await fetch(`https://api.congress.gov/v3/bill?api_key=${congress_api_key}`);

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
    if (text.length > 3000) {
        text = text.slice(0, 3000) + "...";
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
    const requestData = extractRequestData(lawData);
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

            const requestData = extractRequestData(lawData);
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
    fs.readFile(filePath, 'utf8', (error, data) => {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)
        jsonData.laws.push(lawJson);

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (error) => {
            if (error) {
                console.error("error writing file: ", error);
            }
        });
    });
}

function storeLaws(lawsData) {
    const filePath = path.join(__dirname, "lawData.json");
    fs.readFile(filePath, 'utf8', (error, data) => {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)

        for (const lawJson of lawsData) {
            jsonData.laws.push(lawJson);
        }

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (error) => {
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

function CLEAR_LAWDATA_JSON(verification) {
    if (verification == "I AM SURE I WANT TO DELETE ALL OF THE DATA IN LAWDATA.JSON!") {
        const filePath = path.join(__dirname, "lawData.json");
        fs.readFile(filePath, 'utf8', (error, data) => {
            if (error) {
                console.error("Error reading file: ", error);
                return null;
            }

            let jsonData = JSON.parse(data)
            jsonData.laws.length = 0;

            fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (error) => {
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
    fs.readFile(filePath, 'utf8', (error, data) => {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)
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




await storeAllLaws(118);
await getRemainingRequests();
getLawDataJsonLength();


//CLEAR_LAWDATA_JSON("I AM SURE I WANT TO DELETE ALL OF THE DATA IN LAWDATA.JSON!");