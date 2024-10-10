import mongoose from "mongoose";
import passportLocalMongoose from "passport-local-mongoose";

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    bio: String,
    email: String,
    phoneNumber: Number,
    interests: String,
    laws: Array,
    reps: Object,
    newLaws: Array
});

UserSchema.plugin(passportLocalMongoose);

export const User = mongoose.model("User", UserSchema);