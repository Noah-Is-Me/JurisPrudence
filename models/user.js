import mongoose from "mongoose";
import passportLocalMongoose from "passport-local-mongoose";

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,

    email: String,
    phoneNumber: Number,

    age: String,
    gender: String,
    ethnicity: Array,
    maritalStatus: String,

    educationLevel: String,
    employmentStatus: String,
    occupation: String,
    unionMember: String,
    incomeLevel: String,

    citizenshipStatus: String,
    veteranStatus: String,

    medicalConditions: String,
    criminalRecord: String,
    additionalInformation: String,
    interests: String,

    state: String,
    city: String,
    reps: Object,

    laws: Array,
    newLaws: Array,

    debugBio: String
});

UserSchema.plugin(passportLocalMongoose);

export const User = mongoose.model("User", UserSchema);