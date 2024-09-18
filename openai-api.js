// Must 'npm install openai'
// Must 'npm install zod'

import fetch from "node-fetch";
import dotenv from "dotenv";
import OpenAI from "openai"
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import congressApi from "congress-api.js";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const affectedCategoriesFormat = z.object({
    affectedCategories: z.array(z.object({
        categoryName: z.string(),
        impactLevel: z.number().gte(0).lte(10)
    })),
});


async function generateCategories(prompt) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are an expert at structured data extraction. Given an unstructured text from a legislative bill summary, identify what categories of people (e.g., low-income families, doctors, seniors, marylanders) the bill would affect and rate the impact for each category from 0-10. Convert this category/impact data into the given structured format. If no category is affected, leave the array empty." },
                {
                    role: "user",
                    content: `Analyze the following legislative bill summary and apply the instructions provided:

                    ${prompt}
                    
                    Output the affected categories and their impact ratings in the given structured format.`,
                },
            ],
            response_format: zodResponseFormat(affectedCategoriesFormat, "affected_categories_extraction"),
            temperature: 0.3, // default is 1
            max_tokens: 200, // https://platform.openai.com/tokenizer

            //frequency_penalty: 0, // default
            //presence_penalty: 0, // default
            //top_p: 1, // default
        });

        const categoriesResponse = completion.choices[0].message;

        if (categoriesResponse.parsed) {
            return categoriesResponse.parsed;
        }
        else if (categoriesResponse.refusal) {
            // handle refusal
            return null;
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

async function determineMatch(userCategories, billSummary) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are an expert at political legislation and structured data extraction. Given a summary of a legislative bill and the information of a person, determine if the bill is likely to affect the person. If so, identify which traits/categories of the person make this true, and rate the amount of impact the bill has on each category from 0-10. Return this data in the given structured format. If the person is not affected by the bill, leave the array empty." },
                {
                    role: "user",
                    content: `Analyze the following legislative bill summary and the person's information and apply the instructions provided:

                    ${prompt}
                    
                    Determine if the person will be affected directly by the bill and, if applicable, output the affected categories and their impact ratings in the given structured format.`,
                },
            ],
            response_format: zodResponseFormat(affectedCategoriesFormat, "affected_categories_extraction"),
            temperature: 0.3, // default is 1
            max_tokens: 200, // https://platform.openai.com/tokenizer

            //frequency_penalty: 0, // default
            //presence_penalty: 0, // default
            //top_p: 1, // default
        });

        const categoriesResponse = completion.choices[0].message;

        if (categoriesResponse.parsed) {
            return categoriesResponse.parsed;
        }
        else if (categoriesResponse.refusal) {
            // handle refusal
            return null;
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

async function filterAllPastBills(userCategories) {
    var filteredBills = [];

    for (let i=0; i<3000; i++) {
        const billData = await congressApi.fetchBill(118, "hr", i);
        const summaries = await congressApi.extractSummariesFromData(billData);
        const summary = await congressApi.extractSummary(summaries);

        const affectedCategories = determineMatch(userCategories, summary);
        const filteredBill = {
            billData : billData,
            affectedCategories : affectedCategories
        }

        filteredBills.push(filteredBill);
    }

    return filteredBills;
}

console.log(generateCategories(""));
