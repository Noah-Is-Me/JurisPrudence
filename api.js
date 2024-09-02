import fetch from "node-fetch";
import dotenv from "dotenv";
import { parseStringPromise } from "xml2js";

// api linking

// Load environment variables from .env file
dotenv.config();

const congress_api_key = process.env.CONGRESS_API_KEY;
const endpoint = "https://api.congress.gov/v3/bill/117/hr/3076/actions";


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


async function getVotesFromData(billData) {
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
            const rollCallsJson = await parseXmlFromUrl(url);
            const members = rollCallsJson.roll_call_vote.members[0].member;
            allMembersAllVotes.push(members);
        }
    }

    return allMembersAllVotes;
}

async function parseXmlFromUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const xmlText = await response.text();
        const json = await parseStringPromise(xmlText);
        return json;

        //const members = rollCallsJson.roll_call_vote.members;
        //console.log(JSON.stringify(members, null, 2));
        //return members;

    } catch (error) {
        console.error("Error fetching or parsing data");
    }
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

//console.log(await fetchBill(117, "hr", 3076));
//await getVotesFromData(await fetchBill(117, "hr", 3076));
console.log(await getVotes(117, "hr", 3076));
getRemainingRequests();