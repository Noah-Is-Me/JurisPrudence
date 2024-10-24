import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();
const civicInfo_api_key = process.env.CIVCINFO_API_KEY;

export async function fetchRepsFromAddress(address) {
    let reps = {
        houseRep: null,
        senateRep1: null,
        senateRep2: null
    };

    try {
        const response = await fetch(`https://civicinfo.googleapis.com/civicinfo/v2/representatives?address=${address}&key=${civicInfo_api_key}`);

        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const data = await response.json();

        for (let office of data.offices) {
            if (office.name.toLowerCase().includes("u.s. senator")) {
                reps.senateRep1 = data.officials[office.officialIndices[0]].name;
                reps.senateRep2 = data.officials[office.officialIndices[1]].name;

            } else if (office.name.toLowerCase().includes("u.s. representative")) {
                reps.houseRep = data.officials[office.officialIndices[0]].name;
            }
        }

    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }

    return reps;
}

export function getLastName(fullName) {
    let nameParts = fullName.split(" ");
    if (nameParts.length == 1) {
        return fullName;
    }

    // Remove middle initials (single letters followed by a period)
    if (nameParts.length > 2 && nameParts[1].length === 2 && nameParts[1][1] === '.') {
        nameParts.splice(1, 1);  // Remove the middle initial
    }

    // Join everything after the first name as the last name
    let lastName = nameParts.slice(1).join(' ');
    return lastName;
}

//console.log(await fetchRepsFromAddress("4301 East-West Hwy, Bethesda, MD 20814"));
//console.log(await fetchRepsFromAddress("600 Travis St, Houston, TX 77002"));