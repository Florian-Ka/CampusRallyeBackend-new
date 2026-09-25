const express = require("express");
const https = require("https");
const dotenv = require("dotenv");
const cors = require('cors');


dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const sheetIdDE = process.env.SHEET_ID_DE;
const sheetIdEN = process.env.SHEET_ID_EN;

const getSheetUrl = (language) => {
    const sheetId = language === "de" ? sheetIdDE : sheetIdEN;

    if (!sheetId) {
        throw new Error(`Missing environment variable SHEET_ID_${language === "de" ? "DE" : "EN"}`);
    }

    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
};

const fetchSheetData = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let csvData = "";

            res.on("data", (chunk) => {
                csvData += chunk;
            });

            res.on("end", () => {
                resolve(csvToJson(csvData));
            });
        }).on("error", (err) => {
            reject("Error fetching Google Sheets: " + err.message);
        });
    });
};

const TOP_LEVEL_KEYS = [
    "intro",
    "correct-text",
    "wrong-text",
    "finalText",
    "randomize-question-order",
    "tab-title",
    "web-link",
    "prev-btn",
    "check-btn",
    "finished-btn",
    "try-again-btn",
    "try-again-text",
    "continue-btn",
    "question",
    "link-text",
    "solutionText"
];

const QUESTION_FIELD_PATTERN = /(?:^|_)(type|text|options|answer|letter|correctText|subquestion_\d+_type|subquestion_\d+_text|subquestion_\d+_options|subquestion_\d+_answer)$/i;

function normalizeText(value) {
    return String(value || "")
        .replace(/\r/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/^\s+|\s+$/g, "")
        .replace(/""/g, '"');
}

function findQuestionKey(text, startIndex) {
    const regex = /question_\d+(?:_[A-Za-z0-9-]+)*/gi;
    const match = regex.exec(text.slice(startIndex));
    if (!match) return null;
    return { key: match[0], index: startIndex + match.index };
}

function extractKeyValuePairs(data) {
    const text = normalizeText(data);
    const entries = {};
    const orderedKeys = [];

    for (let i = 0; i < TOP_LEVEL_KEYS.length; i++) {
        const key = TOP_LEVEL_KEYS[i];
        const keyIndex = text.toLowerCase().indexOf(key.toLowerCase());
        if (keyIndex !== -1) {
            orderedKeys.push({ key, index: keyIndex });
        }
    }

    const questionMatches = [...text.matchAll(/question_\d+(?:_[A-Za-z0-9-]+)*/gi)];
    questionMatches.forEach((match) => {
        orderedKeys.push({ key: match[0], index: match.index });
    });

    orderedKeys.sort((a, b) => a.index - b.index);

    orderedKeys.forEach((item, idx) => {
        const next = orderedKeys[idx + 1];
        let value = text.slice(item.index + item.key.length, next ? next.index : text.length).trim();

        if (!value) return;

        value = normalizeText(value)
            .replace(new RegExp(`^${item.key}`, "i"), "")
            .replace(/^\s*[,:;]+\s*/, "")
            .replace(/^[\-\s]+/, "");

        if (!value) return;

        entries[item.key] = value;
    });

    return entries;
}

function csvToJson(data) {
    const text = normalizeText(data);
    const entries = extractKeyValuePairs(text);
    const jsonData = { questions: [] };

    Object.entries(entries).forEach(([key, value]) => {
        if (key.startsWith("question_")) {
            const match = key.match(/^question_(\d+)(?:_(.+))?$/);
            if (!match) return;

            const index = Number(match[1]);
            const field = match[2];

            if (!jsonData.questions[index]) {
                jsonData.questions[index] = {};
            }

            if (field) {
                jsonData.questions[index][field] = value;
            }
        } else {
            jsonData[key] = value;
        }
    });

    jsonData.questions = jsonData.questions.filter(Boolean);
    return jsonData;
}


app.get("/", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("de"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error });
    }
});


// German Sheet Endpoint
app.get("/de", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("de"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error });
    }
});

// English Sheet Endpoint
app.get("/en", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("en"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

app.csvToJson = csvToJson;
app.fetchSheetData = fetchSheetData;
app.getSheetUrl = getSheetUrl;

module.exports = app;