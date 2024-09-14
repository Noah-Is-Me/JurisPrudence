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
import { MongoClient, ServerApiVersion } from "mongodb";

if (process.env.NODE_ENV !== "production") {
    dotenv.config();
}

const app = express();
//const router = express.Router();

const uri = process.env.MONGODB_URI;

if (!process.env.MONGODB_URI) {
    throw new Error("Please add your Mongo URI to .env");
}

mongoose.connect(uri).then(() => {
    console.log("Connected to MongoDB Atlas");
}).catch((err) => {
    console.error("Error connecting to MongoDB Atlas:", err.message);
});


const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
});

async function addUser() {

    try {
        const newUser = new User({
            username: "testUsername",
            password: "testPassword"
        });

        // Save the new user to the 'users' collection in the 'userData' database
        await newUser.save();

        console.log("added user");
    } catch (err) {
        console.log("failed to add user");
    }
}

async function getUsers() {
    try {
        const users = await User.find({});
        console.log(users);
    } catch (err) {
        console.log("failed to get users");
    }
}


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
app.use((req, res, next) => {
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


// show login page
app.get("/login", function (req, res) {
    res.render('login', { flashMessages: req.flash() });
    console.log('Flash messages after setting:', req.flash('success')); // Should show the message
    //req.flash('success', 'Operation was successful!');
});

//handle login logic
app.post("/login", passport.authenticate("local",
    {
        successRedirect: "/profile",
        failureRedirect: "/login",
        failureFlash: "Invalid username or password!",
        successFlash: "Welcome to Yucky Politicians!",
    }
));

// show register page
app.get("/register", function (req, res) {
    res.render("register", { flashMessages: req.flash() });
});


// handle register logic
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Create a new user
        const newUser = new User({ username, password });

        // Register the user using passport-local-mongoose (hashes the password)
        await User.register(newUser, password);

        // Flash success message and redirect to profile or login
        req.flash('success', 'Successfully registered! Please log in.');
        res.redirect('/login');
    } catch (err) {
        console.log(err);
        req.flash('error', err.message);
        res.redirect('/register');
    }
});


//logout route
app.get("/logout", function (req, res) {
    req.logout();
    req.flash("success", "See you later!");
    res.redirect("/");
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

        res.render("users/profile", { user });
    } catch (err) {
        req.flash("error", "Something went wrong.")
        res.redirect("/");
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});