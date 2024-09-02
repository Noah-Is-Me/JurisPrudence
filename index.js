console.log("Hello world!");
console.log("Bald");
import fetch from "node-fetch";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { parseStringPromise } from "xml2js";

// api linking

// Load environment variables from .env file
dotenv.config();

const congress_api_key = process.env.CONGRESS_API_KEY;
const endpoint = "https://api.congress.gov/v3/bill/117/hr/3076/actions";

/*
async function getBill() {
    try {
        const response = await fetch(`${endpoint}?api_key=${congress_api_key}`);

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const headers = response.headers;
        const remainingRequests = headers.get("X-RateLimit-Remaining");
        const requestLimit = headers.get("X-RateLimit-Limit");
        const data = await response.json();

        console.log("Remaining requests:  " + remainingRequests + ";  Request limit: " + requestLimit);
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

async function getVotes(billData) {
    const actions = data.actions;
    const voteActions = actions.filter(action => action.recordedVotes);

    voteActions.forEach(action => {
        action.recordedVotes.forEach(vote => {
            //console.log(JSON.stringify(vote, null, 2));

            const url = vote.url;
            parseVoteXML(url);
        })
    });
}

async function parseVoteXML(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const xmlText = await response.text();
        const rollCallsJson = await parseStringPromise(xmlText);

        const members = rollCallsJson.roll_call_vote.members;
        console.log(JSON.stringify(members, null, 2));

    } catch (error) {
        console.error("Error fetching or parsing data");
    }
}

tryFetchBills();
*/


// Path and folder/file linking

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// Set static folder
app.use(express.static(path.join(__dirname, "public")));

// Set views folder
app.set("views", path.join(__dirname, "views"));

// Set view engine
app.set("view engine", "html");
app.engine("html", async (filePath, options, callback) => {
    const ejs = await import("ejs");
    ejs.renderFile(filePath, options, {}, callback);
});
// Home route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "html", "index.html"));
    // Because index.html is static

    //res.render("index");
    // For dynamic viewing, if index.html is in "views"
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});



// CONTROL-C to stop node.js!!!!