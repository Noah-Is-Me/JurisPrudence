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
    Types of bills:
    "hr"     :  House Bill
    "hres"   :  House Simple Resolution
    "hjres"  :  House Joint Resolution
    "hconres":  House Concurrent Resolution

    "s"      :  Senate Bill
    "sres"   :  Senate Simple Resolution
    "sjres"  :  Senate Joint Resolution
    "sconres":  Senate Concurrent Resolution
*/

// TODO: ALL UNCALLED FUNCTIONS ARE NOT TESTED. THEY MIGHT NOT WORK.
// TODO: I might just get rid of this entire if we are dealing with laws instead of bills.

async function fetchBill(congress, billType, billNumber) {
    try {
        const response = await fetch(`https://api.congress.gov/v3/bill/${congress}/${billType}/${billNumber}?api_key=${congress_api_key}`);

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

function extractRequestData(billData) {
    const requestData = {
        congress: billData.request.congress,
        billType: billData.request.billType,
        billNumber: billData.request.billNumber,
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

async function extractFullText(billTextData) {
    const textVersions = billTextData.textVersions;

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
    const finalSummary = summaries[summaries.length - 1];
    const text = toRawText(finalSummary.text);
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



async function fetchAndStoreBill(congress, billType, billNumber) {
    const billData = await fetchBill(congress, billType, billNumber);
    const requestData = extractRequestData(billData);
    const billVotes = await fetchVotes(requestData.congress, requestData.billType, requestData.billNumber);
    if (billVotes == 0 || billVotes == null) return;

    const billSummary = await fetchSummary(requestData.congress, requestData.billType, requestData.billNumber);

    storeBill(billData, billSummary, billVotes);
}

async function fetchAndStoreBills(congress, startingBill, billCount) {
    const bills = (await fetchBills(congress, startingBill, billCount)).bills;
    let billsData = [];

    for (const bill of bills) {
        const url = bill.url;
        try {
            const response = await fetch(`${url}&api_key=${congress_api_key}`);
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }

            const billData = await response.json();

            const shortenedData = {
                title: billData.bill.title,
                date: billData.bill.latestAction.actionDate
            }
            const requestData = extractRequestData(billData);
            //const billVotes = await fetchVotes(requestData.congress, requestData.billType, requestData.billNumber);
            //if (billVotes == 0 || billVotes == null) continue;
            const billSummary = await fetchSummary(requestData.congress, requestData.billType, requestData.billNumber);

            const billJson = {
                billData: shortenedData,
                billSummary: billSummary,
                billRequestData: requestData
            }

            billsData.push(billJson);

        } catch (error) {
            console.error("Error fetching data:", error);
            return null;
        }
    }

    if (billsData.length > 0) {
        storeBills(billsData);
    }
}


function storeBill(billData, billSummary, billVotes) {
    const billJson = {
        billData: billData,
        billSummary: billSummary,
        billVotes: billVotes
    }
    //const stringifiedBill = JSON.stringify(billJson, null, 2);


    const filePath = path.join(__dirname, "billData.json");
    fs.readFile(filePath, 'utf8', function (error, data) {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)
        jsonData.bills.push(billJson);

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), function (error) {
            if (error) {
                console.error("error writing file: ", error);
            }
        });
    });
}

function storeBills(billsData) {
    const filePath = path.join(__dirname, "billData.json");
    fs.readFile(filePath, 'utf8', function (error, data) {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)

        for (const billJson of billsData) {
            jsonData.bills.push(billJson);
        }

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), function (error) {
            if (error) {
                console.error("error writing file: ", error);
            }
        });
    });
}


async function fetchBills(congress, startingBill, billCount) {
    try {
        const response = await fetch(`https://api.congress.gov/v3/bill/${congress}?format=json&offset=${startingBill}&limit=${billCount}&api_key=${congress_api_key}`);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        return await response.json();

    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

function CLEAR_BILLDATA_JSON(verification) {
    if (verification == "I AM SURE I WANT TO DELETE ALL OF THE DATA IN BILLDATA.JSON!") {
        const filePath = path.join(__dirname, "billData.json");
        fs.readFile(filePath, 'utf8', function (error, data) {
            if (error) {
                console.error("Error reading file: ", error);
                return null;
            }

            let jsonData = JSON.parse(data)
            jsonData.bills.length = 0;

            fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), function (error) {
                if (error) {
                    console.error("error writing file: ", error);
                }
            });
            console.log("Alert: billData.json emptied!")
        });
    }
    else {
        console.error("PLEASE DO NOT DELETE THE BILL DATA IF YOU ARE NOT SURE WHAT YOU ARE DOING!!!");
    }
}


//console.log(await fetchBill(117, "hr", 3076));
//await getVotesFromData(await fetchBill(117, "hr", 3076));
//console.log(await getVotes(117, "hr", 3076));
//getRemainingRequests();

//console.log(await fetchBillDetails(117, "hr", 3076, "text"));

//console.log(await extractText(await fetchBillDetails(117, "hr", 3076, "text")));
/*
var bill = 2000
for (var i = 0; i < 10; i++) {
    const votes = await getVotes(117, "hr", bill + i);
    if (votes != null) {
        print(bill + i);
        break;
    }
}
*/

//console.log(await fetchBillDetails(117, "hr", bill, "summaries"));

//console.log(await extractText(await fetchBillDetails(117, "hr", 3076, "text")));

/*
var bill = 2060;
for (let i = 0; i < 10; i++) {
    try {
        fetchAndStoreBill(118, "hr", i);
    }
    catch (error) {
        console.log("error fetching bill " + (bill + i));
    }
}
*/

await fetchAndStoreBills(117, 0, 250);
//fetchAndStoreBill(117, "hr", 3076);

await getRemainingRequests();

//CLEAR_BILLDATA_JSON("I AM SURE I WANT TO DELETE ALL OF THE DATA IN BILLDATA.JSON!");