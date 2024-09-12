/*
npm install mongodb
mongodb+srv://noahsonfield:BOuCyQU5iYvntUDW@2024-cac-cluster.t7tg6.mongodb.net/?retryWrites=true&w=majority&appName=2024-CAC-cluster
mongodb+srv://noahsonfield:<db_password>@2024-cac-cluster.t7tg6.mongodb.net/?retryWrites=true&w=majority&appName=2024-CAC-cluster


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://noahsonfield:BOuCyQU5iYvntUDW@2024-cac-cluster.t7tg6.mongodb.net/?retryWrites=true&w=majority&appName=2024-CAC-cluster";
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);
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
import flash from "connect-flash"
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion } from "mongodb";

const router = express.Router();

dotenv.config();
const dbURL = process.env.DB_URL; // || 'mongodb://localhost:27017/yucky-politicians';

mongoose.connect(dbURL);


const uri = process.env.MONGODB_URI;
const options = {
    useUnifiedTopology: true,
    useNewUrlParser: true
}

let client;
let clientPromise;

if (!process.env.MONGODB_URI) {
    throw new Error("Please add your Mongo URI to .env");
}

if (process.env.NODE_ENV === "development") {
    // In development mode, use a gloval variable so that the value is preserved across module reloads

    if (!global._mongoClientPromise) {
        client = new MongoClient(uri, options);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    // In production mode, it is best to not use a global variable

    client = new MongoClient(uri, options);
    clientPromise = client.connect();
}

//export default clientPromise;

export async function getServerSideProps(context) {
    const client = await clientPromise;
    const isConnected = await client.isConnected();
    const db = client.db("userData");
    const collection = db.collection("users");
    const products = await collection.find({}).toArray();

    return {
        props: {
            isConnected,
            products: JSON.parse(JSON.stringify(products));
        }
    }
}

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
});

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

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
    res.locals.currentUser = req.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
})


app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'));
});


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
    if (!req.isAuthenticated()) {
        req.flash("error", "You must be logged in to view your profile.");
        return res.redirect("/login");
    }


    User.findById(req.user._id, function (err, foundUser) {
        if (err || !foundUser) {
            req.flash("error", "User not found.");
            return res.redirect("/");
        }

        res.render("users/show", { user: foundUser });
    });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});