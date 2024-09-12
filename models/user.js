import mongoose from "mongoose";
import passportLocalMongoose from "passport-local-mongoose";

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    //firstName: String,
    //lastName: String,
});

UserSchema.plugin(passportLocalMongoose);

export var User = mongoose.model("User", UserSchema);