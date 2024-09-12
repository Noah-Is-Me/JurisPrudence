import express from "express";
import path from "path";
import { fileURLToPath } from "url";
//import app from "./app.js";
import { User } from "../models/user.js";
import { Law } from "../models/law.js";

// Path and folder/file linking

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const router = express.Router();
const app = express();

// Set static folder
app.use(express.static(path.join(__dirname, "public")));

// Set views folder
app.set("views", path.join(__dirname, "views"));

// Set view engine
app.set("view engine", "html");
app.engine("html", async (filePath, options, callback) => {
    const ejs = await import("ejs");
    ejs.renderFile(filePath, options, {}, callback);
});


// Home route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "html", "index.html"));
    // Because index.html is static

    //res.render("index");
    // For dynamic viewing, if index.html is in "views"
});



// show register form
router.get("/register", function (req, res) {
    res.render("register", { page: "register" });
});

// handle sign-up logic
router.post("/register", function (req, res) {
    let newUser = new User({ username: req.body.username, password: req.body.password });
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


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});



// CONTROL-C to stop node.js!!!!