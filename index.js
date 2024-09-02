console.log("Hello world!");
console.log("Bald");
import express from "express";
import path from "path";
import { fileURLToPath } from "url";


// Path and folder/file linking

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

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


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});



// CONTROL-C to stop node.js!!!!