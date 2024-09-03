// Must 'npm install openai'
// Must 'npm install zod'

import fetch from "node-fetch";
import dotenv from "dotenv";
import OpenAI from "openai"
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

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
                    content: `Analyze the following bill summary and apply the instructions provided:

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

console.log(generateCategories(""));
