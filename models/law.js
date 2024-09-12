import mongoose from "mongoose";

const lawSchema = new mongoose.Schema({
    name: String,
    date: String,
    congress: Number,
    summary: String,
    //affectedCategories: String,
    //fullText : String,
    //link : String,
    //votes : IDK
})

export const Law = mongoose.model("Law", lawSchema);