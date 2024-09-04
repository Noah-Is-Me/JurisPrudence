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


async function extractSummariesFromData(billData) {
    return null; // TODO: Implement function
}


async function extractVotesFromData(billData) {
    const requestData = billData.request;
    return await getVotes(requestData.congress, requestData.billType, requestData.billNumber)
    // SUPER REDUNDANT!!!!    bill data --> request data --> bill data 
}

async function getVotes(congress, billType, billNumber) {
    const billActions = await fetchBillDetails(congress, billType, billNumber, "actions");
    const voteActions = billActions.actions.filter(action => action.recordedVotes);

    if (voteActions.length == 0) {
        return null;
    }

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

    return allMembersAllVotes;
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

async function extractText(billTextData) {
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

async function extractTextFromSummaries(billSumariesData) {
    const summaries = billSumariesData.summaries;
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
        console.error("Error fetching or parsing data");
    }
}

async function xmlToJson(xml) {
    const json = await parseStringPromise(xml);
    return json;
}



async function fetchAndStoreBill(congress, billType, billNumber) {
    const billData = await fetchBill(congress, billType, billNumber);
    const billSummary = await extractTextFromSummaries(await extractSummariesFromData(billData));
    const billVotes = await extractTextFromVotes(await extractVotesFromData(billData));

    storeBill(billData, billSummary, billVotes);
}


function storeBill(billData, billSummary, billVotes) {
    const billJson = {
        billData: billData,
        billSummary: billSummary,
        billVotes: billVotes
    }
    const stringifiedBill = JSON.stringify(billJson, null, 2)

    console.log(stringifiedBill);
    return;

    const filePath = path.join(__dirname, "billData.json");
    fs.writeFile(filePath, stringifiedBill, (error) => {
        if (error) {
            console.error("Error writing file: ", error);
        }
    });
}


async function fetchBills(congress, startingBill, billCount) {
    try {
        const response = await fetch(`https://api.congress.gov/v3/bill/${congress}?format=json&offset=${startingBill}&limit=${billCount}&api_key=${congress_api_key}`);

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        return response;

    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
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

console.log(await fetchBills(117, 0, 10));

getRemainingRequests();
