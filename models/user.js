import mongoose from "mongoose";
import passportLocalMongoose from "passport-local-mongoose";

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    bio: String,
    //firstName: String,
    //lastName: String,
    laws: Array,
    reps: Object
});

UserSchema.plugin(passportLocalMongoose);

export const User = mongoose.model("User", UserSchema);