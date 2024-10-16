import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { User } from "./models/user.js";
import MongoStore from "connect-mongo";
import passport from "passport";
import LocalStrategy from "passport-local";
import flash from "connect-flash"
import dotenv from "dotenv";
import cron from "node-cron";
//import { MongoClient, ServerApiVersion } from "mongodb";

import { filterAllPastLaws, filterLaws, filterLaw, getAllPastLaws } from "./openai-api.js";
import { getLawFromJson, fetchVotes, analyzeVotes, getNewLaws } from "./congress-api-law.js";
import { fetchRepsFromAddress, getLastName } from "./civicInfo-api.js";

if (process.env.NODE_ENV !== "production") {
    dotenv.config();
}

const app = express();
//const router = express.Router();

const uri = process.env.MONGODB_URI;

if (!process.env.MONGODB_URI) {
    throw new Error("Please add your Mongo URI to .env");
}

mongoose.connect(uri, {}).then(function () {
    console.log("Connected to MongoDB Atlas");
}).catch(function (err) {
    console.error("Error connecting to MongoDB Atlas:", err.message);
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function () {
    console.log("Database connected");
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const secret = process.env.SECRET || "thisshouldbeabettersecret!";

const store = MongoStore.create({
    mongoUrl: uri,
    secret,
    touchAfter: 24 * 60 * 60 // Only update session if it is changed in the last 24 hours
});

store.on("error", function (e) {
    console.log("SESSION STORE ERROR", e)
});


app.use(session({
    store,
    name: "session",
    secret,
    resave: false,
    saveUninitialized: true,

    cookie: {
        httpOnly: true,  // Prevents client-side JavaScript from accessing the cookie
        secure: process.env.NODE_ENV === "production",  // Ensure it's secure only in production
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,  // 7 days
        maxAge: 1000 * 60 * 60 * 24 * 7  // 7 days
    }

}));


app.use(passport.initialize());
app.use(passport.session());

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
passport.use(new LocalStrategy(User.authenticate()));

app.use(flash());
app.use(function (req, res, next) {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));


cron.schedule("0 12 * * *", function () {
    updateLaws();
}, {
    scheduled: true,
    timezone: "America/New_York"
});
// The law cache and profiles update every day at 12:00 PM while the app is running.

async function updateLaws() {
    console.log("Updating laws...");
    const newLaws = await getNewLaws();

    try {
        const users = await User.find({});

        //for (let user of users) {
        for (let i = 0; i < users.length; i++) {
            let user = users[i];

            const filteredLaws = await filterLaws(user.bio, newLaws);
            user.newLaws.push(...filteredLaws);
            user.laws.push(...filteredLaws);

            await user.save();
            console.log(`Updated ${user.username}`);
        }
    } catch (error) {
        console.error('Error updating ${user.username}:', error);
    }
}


// root page
app.get("/", function (req, res) {
    res.render("index", {});
});
// This is how you make it start on a page!

app.get("/about", function (req, res) {
    res.render("about", {});
});


app.get("/test", function (req, res) {
    res.render("test", {});
});


app.get("/login",
    async function (req, res, next) {
        //console.log(req.session);
        //console.log(req.session.user);
        if (req.session && req.session.passport) {
            const user = await User.findById(req.user._id).exec();
            return res.render("login", { user });
        }
        next();
    },
    function (req, res) {
        //console.log(req.flash());
        res.render("login", { user: null });
    }
);

//handle login logic
app.post("/login",
    /*
        function (req, res, next) {
            const { username, password } = req.body;
            console.log(username);
            req.session.user = { username };
            console.log(req.session.user);
            next();
        },
        */
    /*
 function (req, res, next) {
     //console.log(req.session);
     //console.log(req.session.user);
     if (req.session && req.session.passport) {
         return res.redirect("/profile");
     }
     next();
 },*/
    passport.authenticate("local",
        {
            successFlash: true,
            failureFlash: true,

            successRedirect: "/profile",
            failureRedirect: "/login",
        }
    )
);

app.get("/register", function (req, res) {
    res.render("register", {});
});


// handle register logic
app.post("/register", async function (req, res) {
    const {
        username, password,

        email, phoneNumber,

        age, gender, ethnicity, maritalStatus,

        educationLevel, employmentStatus, occupation, unionMember, incomeLevel,

        citizenshipStatus, veteranStatus,

        medicalConditions, criminalRecord, additionalInformation, interests,

        state, city, houseRep, senateRep1, senateRep2
    } = req.body;

    try {
        const reps = {
            houseRep: houseRep,
            senateRep1: senateRep1,
            senateRep2: senateRep2
        }

        const newUser = new User({
            username, password,

            email, phoneNumber,

            age, gender, ethnicity, maritalStatus,

            educationLevel, employmentStatus, occupation, unionMember, incomeLevel,

            citizenshipStatus, veteranStatus,

            medicalConditions, criminalRecord, additionalInformation, interests,

            state, city, reps,

            laws: [], newLaws: []
        });

        //console.log("Registering");

        // Register the user using passport-local-mongoose (hashes the password)
        await User.register(newUser, password);
        req.session.user = newUser;

        //console.log("Done registering");
        res.redirect("/loading");
    } catch (err) {
        console.log(err);
        req.flash("error", err.message);
        res.redirect("/register");
    }
});

app.get("/loading", function (req, res) {
    res.render("loading", {});
});


// SSE endpoint
app.get('/filter-stream', async function (req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!req.session.user) {
        res.write(`data: ${JSON.stringify({ message: "Filter complete", complete: true })}\n\n`);
        res.end();
        return;
    }

    const userId = req.session.user._id;
    const user = await User.findById(userId);

    if (user != undefined && user != null) {
        const bio = parseUserBio(user);
        const filteredLaws = await filterAllPastLaws(bio, res);
        user.laws = filteredLaws;
        user.newLaws = filteredLaws;
        await user.save();
    } else {
        await filterAllPastLaws("", res);
    }

    res.write(`data: ${JSON.stringify({ message: "Filter complete", complete: true })}\n\n`);
    req.session.destroy();
    setTimeout(function () { res.end(); }, 1000);

    req.on("close", function () {
        //console.log("closed stream");
        res.end();
    });
});

function parseUserBio(user) {
    const skipKeys = ["username", "password", "email", "phoneNumber", "reps", "laws", "newLaws", "_id", "__v"];
    let bio = "";

    for (const key in user._doc) {
        if (skipKeys.includes(key)) continue;

        const value = user._doc[key];
        if (value == "" || value == null || value == undefined) continue;

        bio += key + ": " + value + "\n";
    }

    console.log(bio);
    return bio;
}

// const user = await User.findById("67088d2adeacef6b8b9201c5");
// console.log(parseUserBio(user));

app.post("/set-flash-message", function (req, res) {
    const { type, message } = req.body;
    req.flash(type, message);
    res.status(200).send();
});


// Define the route for fetching representatives
app.post("/api/reps", async function (req, res) {
    const { address } = req.body;
    try {
        const reps = await fetchRepsFromAddress(address);
        if (reps) {
            res.json(reps);
        } else {
            res.status(404).json({ message: "Representatives not found" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});


app.post("/remove-new-law/:index", async function (req, res) {
    try {
        const userId = req.user._id;
        const index = req.params.index;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        if (index >= 0 && index < user.newLaws.length) {
            user.newLaws.splice(index, 1);
            await user.save();

            return res.status(200).json({ redirectUrl: "/profile" });
        } else {
            return res.status(400).json({ message: "Invalid index." });
        }
    }
    catch (err) {
        console.log("Error updating profile:", err);
        return res.status(500).json({ message: "Error updating profile." });
    }
});


app.get("/logout", function (req, res) {
    req.logout(function (err) {
        if (err) { return next(err); }
        req.flash("success", "See you later!");
        res.redirect("/");
    });
});

app.get("/profile", async function (req, res) {
    if (!req.isAuthenticated()) {
        req.flash("error", "You must be logged in to view your profile.");
        return res.redirect("/login");
    }
    // This should be in a middleware file. Too bad!

    try {
        const user = await User.findById(req.user._id).exec();
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/");
        }

        res.render("profile", { user });
    } catch (err) {
        req.flash("error", "Something went wrong.")
        res.redirect("/");
    }
});

app.post("/update-profile", async function (req, res) {
    try {
        const userId = req.user._id;
        const updatedProperties = req.body;

        if (updatedProperties.houseRep || updatedProperties.senateRep1 || updatedProperties.senateRep2) {
            updatedProperties.reps = {
                houseRep: updatedProperties.houseRep,
                senateRep1: updatedProperties.senateRep1,
                senateRep2: updatedProperties.senateRep2
            };
            delete updatedProperties.houseRep;
            delete updatedProperties.senateRep1;
            delete updatedProperties.senateRep2;
        }

        const section = updatedProperties.section || "account-information";

        // console.log(updatedProperties);
        // console.log(userId);


        await User.findByIdAndUpdate(userId, { $set: updatedProperties });

        if (section == "demography" || section == "education-employment" || section == "citizenship-information" || section == "additional-information") {
            const user = await User.findById(userId);
            req.session.user = user;
            return res.redirect("/loading");
        }

        req.flash("success", "Profile successfully updated!");

        res.redirect(`/profile?section=${section}`);
    }
    catch (err) {
        console.log('Error updating profile:', err);
        res.status(500).send('Error updating profile.');
    }
})

app.get("/laws", async function (req, res) {
    if (!req.isAuthenticated()) {
        req.flash("error", "You must be logged in to view your profile.");
        return res.redirect("/login");
    }
    // This should be in a middleware file. Too bad!

    try {
        const user = await User.findById(req.user._id).exec();
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/");
        }

        res.render("laws", { user });
    } catch (err) {
        req.flash("error", "Something went wrong.")
        res.redirect("/");
    }
});

app.get("/law/:congress/:billType/:billNumber", async function (req, res) {
    const congress = parseInt(req.params.congress);
    const billType = req.params.billType;
    const billNumber = parseInt(req.params.billNumber);
    const law = await getLawFromJson(congress, billType, billNumber);
    const votes = await fetchVotes(congress, billType, billNumber);

    const { house_rep, senate_rep_1, senate_rep_2 } = req.query;
    //let houseRepVote, senateRep1Vote, senateRep2Vote = null;

    const repData = {
        houseRep: getLastName(house_rep),
        senateRep1: getLastName(senate_rep_1),
        senateRep2: getLastName(senate_rep_2)
    };

    const voteAnalysis = analyzeVotes(votes, repData);
    const voteBreakdown = voteAnalysis.voteBreakdown;
    const voteData = voteAnalysis.voteData;

    let colorData = {
        senate: {
            democratic: {
                yes: 0,
                no: 0,
            },
            republican: {
                yes: 0,
                no: 0,
            }
        },
        house: {
            democratic: {
                yes: 0,
                no: 0,
            },
            republican: {
                yes: 0,
                no: 0,
            }
        }
    };

    for (let chamber in colorData) {
        let colorMult = chamber == "house" ? 0.75 : 2;
        for (let party in colorData[chamber]) {
            for (let prop in colorData[chamber][party]) {
                if (party == "democratic") {
                    colorData[chamber][party][prop] = `rgb(${Math.max(255 - voteBreakdown[chamber][party][prop] * colorMult, 100)}, ${Math.max(255 - voteBreakdown[chamber][party][prop] * colorMult, 100)}, ${255})`;
                } else if (party == "republican") {
                    colorData[chamber][party][prop] = `rgb(${255}, ${Math.max(255 - voteBreakdown[chamber][party][prop] * colorMult, 100)}, ${Math.max(255 - voteBreakdown[chamber][party][prop] * colorMult, 100)})`;
                }
            }
        }
    }

    //console.log(voteAnalysis);
    //console.log(voteAnalysis.voteBreakdown);

    //voteData = getRepresentativesVote(votes, repData);

    res.render("law", { law, voteData, voteBreakdown, repData, colorData });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
    console.log(`Server running on http://localhost:${PORT}`);
});

//updateLaws();