import dotenv from "dotenv";
import OpenAI from "openai"
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getRandomCachedLaw, getAllCachedLaws, getCachedLaw } from "./congress-api-law.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const affectedCategoriesFormat = z.object({
    affectedCategories: z.array(z.object({
        categoryName: z.string(),
        impactLevel: z.number()//.gte(0).lte(10)
    })),
});

async function determineMatch(userCategories, lawSummary) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are an expert at political legislation and structured data extraction. Given a summary of a legislative law and the information of a person, determine if the law is likely to affect the person. If so, identify which traits/categories of the person make this true, and rate the amount of impact the law has on each category from 0-10. Return this data in the given structured format. If the person is not affected by the law, leave the array empty." },
                {
                    role: "user",
                    content: `Analyze the following legislative law summary and the person's information and apply the instructions provided:

                    User information: ${userCategories}.

                    Law: "${lawSummary}"
                    
                    Determine if the person will be affected directly by the law and, if the law is applicable, output which traits/categories of the person make this true and the impact ratings of each trait/category in the given structured format. Be specific and exclusive with the categories.`,
                },
            ],
            response_format: zodResponseFormat(affectedCategoriesFormat, "affected_categories_extraction"),
            temperature: 1, // default is 1
            max_tokens: 200, // https://platform.openai.com/tokenizer

            //frequency_penalty: 0, // default
            //presence_penalty: 0, // default
            //top_p: 1, // default
        });

        const categoriesResponse = completion.choices[0].message;

        if (categoriesResponse.refusal) {
            // handle refusal
            console.log("Prompt Refusal");
            return null;
        }
        else {
            return JSON.parse(categoriesResponse.content);
        }

    } catch (error) {
        if (error.constructor.name == "LengthFinishReasonError") {
            // Retry with a higher max tokens
            console.log("Too many tokens: ", error.message);
            return null;
        } else {
            // Handle other exceptions
            console.log("An error occurred: ", error.message);
            return null;
        }
    }
}

async function filterAllPastLaws(userCategories) {
    const allLaws = await getAllCachedLaws();
    var filteredLaws = [];

    for (let i = 0; i < allLaws.length; i++) {
        console.log(`${i + 1}/${allLaws.length}`);

        const law = allLaws[i];
        const lawData = law.lawData;
        const summary = lawData.summary;

        let response;
        let affectedCategories;

        do {
            response = await determineMatch(userCategories, summary);
            affectedCategories = response.affectedCategories;

        } while (affectedCategories == null || response == null);

        //console.log(summary);
        //console.log(response);

        for (let j = 0; j < affectedCategories.length; j++) {
            if (affectedCategories[j].impactLevel < 5) {
                affectedCategories.splice(j, 1);
                j--;
            }
        }

        if (affectedCategories.length == 0) {
            continue;
        }

        const filteredLaw = {
            lawData: lawData,
            requestData: law.requestData,
            affectedCategories: affectedCategories
        }

        filteredLaws.push(filteredLaw);
    }

    return filteredLaws;
}


async function testResponse() {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            {
                role: "user",
                content: "Write a haiku about recursion in programming.",
            },
        ],
    });

    return completion.choices[0].message;
}

async function saveTestResponse(userCategories, filteredLaws) {
    const filePath = path.join(__dirname, "testResponse.json");
    fs.readFile(filePath, 'utf8', (error, data) => {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)

        jsonData.userCategories = userCategories;
        jsonData.filteredLaws = filteredLaws;

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (error) => {
            if (error) {
                console.error("error writing file: ", error);
            }
        });
    });
}

const userCategories = "Teacher, age 60, female, married, no children, lives in Washington DC, low-income, tax bracket 10%, 3 DUIs (on probation), driving license suspended, works at a public high school, Master's degree in Education, 35 years teaching experience.";

/*
const law = await getRandomCachedLaw();
const lawSummary = law["lawData"]["summary"];

console.log(law);
//console.log(lawSummary);

const response = await determineMatch(userCategories, lawSummary);
console.log(response);
*/

const filteredLaws = await filterAllPastLaws(userCategories);
//console.log(filteredLaws);

await saveTestResponse(userCategories, filteredLaws);