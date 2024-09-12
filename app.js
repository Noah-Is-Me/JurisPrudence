//TODO: Must npm install mongoose, body-parser, express-session, connect-mongo

/*
import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import session from "express-session";
import connectMongo from "connect-mongo";

const MongoStore = connectMongo(session);


const app = express();

mongoose.connect("mongodb://localhost:27017/mydatabase", {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connections;

app.use(session({
    secret: 'mysecret', // Replace with a random string for session encryption
    resave: false,
    saveUnitialized: true,
    store: new MongoStore({ mongooseConnection: db })
}));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//TODO: Get rid of default export (yucky!)
export default app;
*/

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

const router = express.Router();

const dbURL = process.env.DB_URL || 'mongodb://localhost:27017/yucky-politicians';

mongoose.connect(dbURL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
});

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));

const secret = process.env.SECRET || 'thisshouldbeabettersecret!';

const store = MongoStore.create({
    mongoUrl: dbURL,
    secret,
    touchAfter: 24 * 60 * 60
});

store.on("error", function (e) {
    console.log("SESSION STORE ERROR", e)
})


app.use(session({
    store,
    name: "sesson",
    secret,
    resave: false,
    saveUnitialized: true,
    /*
    cookie: {
        httpOnly: true,
        // secure: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
    */
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(User.serializeUser);
passport.deserializeUser(User.deserializeUser);
passport.use(new LocalStrategy(User.authenticate()));





router.get("/register", function (req, res) {
    res.render("register", { page: "register" });
});

// handle sign-up logic
router.post("/register", function (req, res) {
    const newUser = new User({ username: req.body.username, password: req.body.password });
    User.register(newUser, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            return res.render("register", { error: err.message });
        }
        passport.authenticate("local")(req, res, function () {
            req.flash("success", "Succesfully signed up! Nice to meet you " + req.body.username);
            res.redirect("/profile");
        })
    })

})

// show login form
router.get("/login", function (req, res) {
    res.render("login", { page: "login" });
});

//handle login logic
router.post("/login", passport.authenticate("local",
    {
        successRedirect: "/profile",
        failureRedirect: "/login",
        failureFlash: true,
        successFlash: "Welcome to Yucky Politicians!",
    }), function (req, res) {
    }
);

//logout route
router.get("/logout", function (req, res) {
    req.logout();
    req.flash("success", "See you later!");
    res.redirect("/");
})

/*
// User profile
// TODO: GET RID OF THIS FOR PRIVACY REASONS!!! THIS IS JUST FOR DEBUGGING!!!
router.get("/users/:id", function (req, res) {
    User.findById(req.params.id, function (err, foundUser) {
        if (err) {
            req.flash("error", "Something went wrong.");
            res.redirect("/");
        }

        res.render("users/show", { user: foundUser });
    });
});
*/

router.get("/profile", function (req, res) {
    User.findById(req.params.id, function (err, foundUser) {
        if (err) {
            req.flash("error", "Something went wrong.");
            res.redirect("/");
        }

        res.render("users/show", { user: foundUser });
    });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});