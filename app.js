import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { User } from "./models/user.js";
import { Law } from "./models/law.js";
import MongoStore from "connect-mongo";
import passport from "passport";
import LocalStrategy from "passport-local";
import flash from "connect-flash"
import dotenv from "dotenv";
//import { MongoClient, ServerApiVersion } from "mongodb";

import { filterAllPastLaws } from "./openai-api.js";
import { getLawFromJson, fetchVotes, getRepresentativeVote, getRepresentativesVote, analyzeVotes } from "./congress-api-law.js"

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

const secret = process.env.SECRET || 'thisshouldbeabettersecret!';

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
        secure: process.env.NODE_ENV === 'production',  // Ensure it's secure only in production
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
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

app.set('view engine', 'ejs');
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// root page
app.get("/", function (req, res) {
    res.render("index", { flashMessages: req.flash() });
});


app.get("/login",
    function (req, res, next) {
        //console.log(req.session);
        //console.log(req.session.user);
        if (req.session && req.session.passport) {
            return res.redirect("/profile");
        }
        next();
    },
    function (req, res) {
        res.render('login', { flashMessages: req.flash() });
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
    passport.authenticate("local",
        {
            failureFlash: "Invalid username or password!",
            successFlash: "Welcome to Yucky Politicians!",
            successRedirect: "/profile",
            failureRedirect: "/login",
        }
    ));

app.get("/register", function (req, res) {
    res.render("register", { flashMessages: req.flash() });
});


// handle register logic
app.post('/register', async function (req, res) {
    const { username, password, bio, houseRep, senateRep1, senateRep2 } = req.body;

    try {
        console.log("Filtering laws...");
        const filteredLaws = await filterAllPastLaws(bio);

        const reps = {
            houseRep, senateRep1, senateRep2
        }

        const newUser = new User({ username, password, bio, laws: filteredLaws, reps });

        // Register the user using passport-local-mongoose (hashes the password)
        await User.register(newUser, password);

        req.flash('success', 'Successfully registered! Please log in.');
        res.redirect('/login');
    } catch (err) {
        console.log(err);
        req.flash('error', err.message);
        res.redirect('/register');
    }
});


app.get("/logout", function (req, res) {
    req.logout(function (err) {
        if (err) { return next(err); }
        req.flash("success", "See you later!");
        res.redirect('/');
    });
})

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

        res.render("users/profile", { user, flashMessages: req.flash() });
    } catch (err) {
        req.flash("error", "Something went wrong.")
        res.redirect("/");
    }
});

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

        res.render("users/laws", { user, flashMessages: req.flash() });
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
        houseRep: house_rep,
        senateRep1: senate_rep_1,
        senateRep2: senate_rep_2
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

    res.render('law', { law, voteData, voteBreakdown, repData, colorData, flashMessages: req.flash() });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
    console.log(`Server running on http://localhost:${PORT}`);
});