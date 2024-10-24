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
        impactLevel: z.number(),//.gte(0).lte(10)
        //explanation: z.string()
    })),
});

const lawRelevance = z.object({
    relevanceLevel: z.number(),
    reasoning: z.string(),
})

async function determineMatch(userCategories, lawSummary) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                // NOTE: In the role section, you have to explicitly tell the AI to "Return this data in the given structured format. If the person is not affected by the law, leave the array empty.".
                { role: "system", content: "You are an expert at political legislation and structured data extraction. Given a summary of a legislative law and the information of a person, determine if the law is relevant to the person. If so, provide a short ~2 sentence reasoning and rate the law's relevance to the person from 1-10. Return this data in the given structured format. If the person is not affected by the law, leave the reasoning empty and rate the impact 0." },
                {
                    role: "user",
                    content: `Analyze the following legislative law summary and the person's information and apply the instructions provided:

                    User information: ${userCategories}.

                    Law: "${lawSummary}"
                    
                    Determine if the person will be affected directly by the law. If so, give reasoning and a relevance level rating. Write your reasoning in the second person, directed towards the person.`,
                },
            ],
            response_format: zodResponseFormat(lawRelevance, "law_relevance_extraction"),
            max_tokens: 200, // https://platform.openai.com/tokenizer

            temperature: 1, // default is 1
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

export async function filterAllPastLaws(userCategories, res) {
    const allLaws = await getAllCachedLaws();
    return await filterLaws(userCategories, allLaws, res);
}

export async function filterLaws(userCategories, allLaws, res) {
    const sendUpdates = (res != undefined && res != null);

    let filteredLaws = [];

    lawLoop:
    for (let i = 0; i < allLaws.length; i++) {
        //console.log(`${i + 1}/${allLaws.length}`);

        const law = allLaws[i];
        const lawData = law.lawData;
        const summary = lawData.summary;

        let response;
        let attempt = 0;

        if (sendUpdates) {
            await new Promise(resolve => setImmediate(resolve));
            const percent = Math.floor((i + 1) / allLaws.length * 100);
            res.write(`data: ${JSON.stringify(percent)}\n\n`);
        }

        do {
            try {
                response = await determineMatch(userCategories, summary);
                if (response == null) {
                    console.log("Error! determineMatch response is null!");

                    if (attempt > 5) {
                        continue lawLoop;
                    }
                    attempt++;
                    continue;
                }

            }
            catch (error) {
                console.log("Error determining match!");

                if (attempt > 5) {
                    continue lawLoop;
                }
                attempt++;
                continue;
            }

        } while (response == null || response.relevanceLevel == null || response.reasoning == null);

        console.log("\n" + lawData.title + ": ");
        console.log(response);
        const relevanceLevel = response.relevanceLevel;
        const reasoning = response.reasoning;

        //console.log(summary);
        //console.log(response);

        if (relevanceLevel < 3) {
            continue lawLoop;
        }

        const filteredLaw = {
            lawData: lawData,
            requestData: law.requestData,
            reasoning: reasoning
        }

        filteredLaws.push(filteredLaw);

    }

    return filteredLaws;
}

export async function getAllPastLaws() {
    return await getAllCachedLaws();
}

export async function filterLaw(allLaws, index, bio, res) {

    console.log(`${index + 1}/${allLaws.length}`);

    const law = allLaws[index];
    const lawData = law.lawData;
    const summary = lawData.summary;

    let response;
    let attempt = 0;

    //sleep(100);
    return index;

    do {
        try {
            response = await determineMatch(userCategories, summary);
            if (response == null) {
                console.log("Error! determineMatch response is null!");

                if (attempt > 5) {
                    return null;
                }
                attempt++;
                continue;
            }

        }
        catch (error) {
            console.log("Error determining match!");

            if (attempt > 5) {
                return null;
            }
            attempt++;
            continue;
        }

    } while (response == null || response.affectedCategories == null);

    const affectedCategories = response.affectedCategories;

    for (let j = 0; j < affectedCategories.length; j++) {
        if (affectedCategories[j].impactLevel < 5) {
            affectedCategories.splice(j, 1);
            j--;
        }
    }

    if (affectedCategories.length == 0) {
        return null;
    }

    const filteredLaw = {
        lawData: lawData,
        requestData: law.requestData,
        affectedCategories: affectedCategories
    }

    return filteredLaw;
}

export async function generateRelevence(userCategories, lawSummary) {
    let attempt = 0;
    while (attempt++ < 5) {
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are an expert at political legislation. Given a summary of a legislative law and the information of a person, provide a short and concise ~2 sentence reasoning why the law is relevent to the user." },
                    {
                        role: "user",
                        content: `Analyze the following legislative law summary and the person's information and apply the instructions provided:

                    User information: ${userCategories}.

                    Law: "${lawSummary}"
                    
                    Provide a short ~2 sentence reasoning why the law is relevent to the user. Write your reasoning in the second person, directed towards the person.`,
                    },
                ],
                max_tokens: 200,
                temperature: 1
            });

            const categoriesResponse = completion.choices[0].message;

            if (categoriesResponse.refusal) {
                // handle refusal
                console.log("Prompt Refusal");
                return null;
            }
            else {
                return categoriesResponse.content;
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
    fs.readFile(filePath, 'utf8', function (error, data) {
        if (error) {
            console.error("Error reading file: ", error);
            return null;
        }

        let jsonData = JSON.parse(data)

        jsonData.userCategories = userCategories;
        jsonData.filteredLaws = filteredLaws;

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), function (error) {
            if (error) {
                console.error("error writing file: ", error);
            }
        });
    });
}

//const userCategories = "Teacher, age 60, female, married, no children, lives in Washington DC, low-income, tax bracket 10%, 3 DUIs (on probation), driving license suspended, works at a public high school, Master's degree in Education, 35 years teaching experience.";

/*
const law = await getRandomCachedLaw();
const lawSummary = law["lawData"]["summary"];

console.log(law);
//console.log(lawSummary);

const response = await determineMatch(userCategories, lawSummary);
console.log(response);
*/

//const filteredLaws = await filterAllPastLaws(userCategories);
//console.log(filteredLaws);

//await saveTestResponse(userCategories, filteredLaws);