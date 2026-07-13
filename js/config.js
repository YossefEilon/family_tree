export const API_URL = "https://script.google.com/macros/s/AKfycbz02169Q1eT6-qzlsfaabhLslQiAkR77-ZGck_B6jjCgxRY7ahpog3falSy71hY44tW/exec"; 

export const demoFamilyData = {
    "nodes": [
        { "id": "1", "name": "אברהם כהן", "role": "אב", "birth": "1930", "hebrewBirthDate": "", "death": "2010", "gender": "male", "level": 0, "isAlive": false, "birthCountry": "מרוקו", "previousLastName": "", "lifeStory": "עלה לארץ בשנת 1950. בנה את ביתו בירושלים והיה ממייסדי הקהילה המקומית.", "profilePic": "", "hebrewDeathDate": "י' באב" },
        { "id": "10", "name": "שרה כהן", "role": "אם", "birth": "1932", "hebrewBirthDate": "", "death": "2015", "gender": "female", "level": 0, "isAlive": false, "birthCountry": "מרוקו", "previousLastName": "לוי", "lifeStory": "", "profilePic": "", "hebrewDeathDate": "ג' בחשוון" },
        { "id": "2", "name": "דוד כהן", "role": "בן", "birth": "1955", "hebrewBirthDate": "א' בניסן ה'תשט\"ו", "death": "", "gender": "male", "level": 1, "isAlive": true, "birthCountry": "ישראל", "previousLastName": "", "lifeStory": "", "profilePic": "", "hebrewDeathDate": "" },
        { "id": "3", "name": "רחל ישראלי", "role": "בת", "birth": "1958", "hebrewBirthDate": "ט\"ו בשבט ה'תשי\"ח", "death": "", "gender": "female", "level": 1, "isAlive": true, "birthCountry": "ישראל", "previousLastName": "כהן", "lifeStory": "", "profilePic": "", "hebrewDeathDate": "" },
        { "id": "4", "name": "יוסף כהן", "role": "נכד", "birth": "1982", "hebrewBirthDate": "", "death": "", "gender": "male", "level": 2, "isAlive": true, "birthCountry": "ישראל", "previousLastName": "", "lifeStory": "", "profilePic": "", "hebrewDeathDate": "" },
        { "id": "5", "name": "שירה לוי", "role": "נכדה", "birth": "1985", "hebrewBirthDate": "", "death": "", "gender": "female", "level": 2, "isAlive": true, "birthCountry": "ישראל", "previousLastName": "כהן", "lifeStory": "", "profilePic": "", "hebrewDeathDate": "" },
        { "id": "6", "name": "רועי ישראלי", "role": "בעל", "birth": "1956", "hebrewBirthDate": "", "death": "", "gender": "male", "level": 1, "isAlive": true, "birthCountry": "ישראל", "previousLastName": "", "lifeStory": "", "profilePic": "", "hebrewDeathDate": "" }
    ],
    "links": [
        { "source": "1", "target": "10", "type": "spouse" },
        { "source": "1", "target": "2", "type": "parent" },
        { "source": "10", "target": "2", "type": "parent" },
        { "source": "1", "target": "3", "type": "parent" },
        { "source": "10", "target": "3", "type": "parent" },
        { "source": "2", "target": "4", "type": "parent" },
        { "source": "2", "target": "5", "type": "parent" },
        { "source": "6", "target": "3", "type": "spouse" }
    ]
};

export const globalState = {
    familyData: { nodes: [], links: [] },
    currentNode: null,
    filteredRootId: null,
    isAdmin: false
};

export const nodeWidth = 230;
export const nodeHeight = 110;
