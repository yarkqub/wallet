const express = require("express")
const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)
const Database = require("better-sqlite3")
const db = new Database("database.db", { verbose: null })
const PORT = 80

//create account table
db.prepare("CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY AUTOINCREMENT, acc_name TEXT, balance NUMERIC, last_use INTEGER, usage NUMERIC, income NUMERIC)").run()
db.prepare("CREATE TABLE IF NOT EXISTS balance (id INTEGER PRIMARY KEY AUTOINCREMENT, acc_id INTEGER, cat_id INTEGER, flow INTEGER, amount NUMERIC, datetime TEXT)").run()
db.prepare("CREATE TABLE IF NOT EXISTS kategori (id INTEGER PRIMARY KEY AUTOINCREMENT, cat_parent INTEGER, cat_name TEXT)").run()

const db_check1 = db.prepare("SELECT COUNT(*) FROM account").get()
if (!db_check1["COUNT(*)"]) {
    db.prepare("INSERT INTO account (acc_name, balance, last_use, usage, income) VALUES (?, ?, ?, ?, ?)").run("cash", "0", "1", "0", "0")
}
const db_check2 = db.prepare("SELECT COUNT(*) FROM kategori").get()
if (!db_check2["COUNT(*)"]) {
    install_category()
}

app.use("/", express.static(__dirname + "/client"))

io.on("connection", socket => {

    const get_cat = () => {
        const get_cat = db.prepare("SELECT * FROM kategori WHERE cat_parent = ?").all(0)
        socket.emit("category", get_cat)
    }
    const get_subcat = parent_id => {
        const get_subcat = db.prepare("SELECT * FROM kategori WHERE cat_parent = ?").all(parent_id)
        socket.emit("subcat", get_subcat)
    }
    const get_account = () => {
        const get_account = db.prepare("SELECT * FROM account").all()
        socket.emit("account_list", get_account)
        get_record()
    }
    const use_account = id => {
        if (!id) {
            const get_account = db.prepare("SELECT * FROM account WHERE last_use = ?").get("1")
            socket.emit("use_account", get_account)
        }
        else {
            db.prepare("UPDATE account SET last_use = ?").run("0")
            const get_account = db.prepare("SELECT * FROM account WHERE id = ?").get(id)
            db.prepare("UPDATE account SET last_use = ? WHERE id = ?").run("1", id)
            socket.emit("use_account", get_account)
        }
        get_record()
        get_cat()
    }
    const get_record = () => {
        const acc = db.prepare("SELECT * FROM account WHERE last_use = ?").get("1")
        const rec = db.prepare("SELECT * FROM balance WHERE acc_id = ? ORDER BY id DESC LIMIT 10").all(acc["id"])
        const cat = db.prepare("SELECT * FROM kategori").all()
        socket.emit("record_list", { rec: rec, cat: cat, acc: acc })
    }

    //get_cat()
    use_account()
    //get_record()

    socket.on("add_category", data => {
        db.prepare("INSERT INTO kategori (cat_parent, cat_name) VALUES (?, ?)").run(0, data)
        get_cat()
    })
    socket.on("add_subcat", data => {
        db.prepare("INSERT INTO kategori (cat_parent, cat_name) VALUES (?, ?)").run(data.parent, data.name)
        get_subcat(data.parent)
    })
    socket.on("req_catsublist", data => {
        get_subcat(data)
    })
    socket.on("delete_subcat", data => {
        const count_record = db.prepare("SELECT COUNT(*) FROM balance WHERE cat_id = ?").get(data)
        if (!count_record["COUNT(*)"]) {
            const item_data = db.prepare("SELECT * FROM kategori WHERE id = ?").get(data)
            db.prepare("DELETE FROM kategori WHERE id = ?").run(data)
            get_subcat(item_data["cat_parent"])
        }
    })
    socket.on("delete_cat", data => {
        const count_sub = db.prepare("SELECT COUNT(*) FROM kategori WHERE cat_parent = ?").get(data)
        if (!count_sub["COUNT(*)"]) {
            db.prepare("DELETE FROM kategori WHERE id = ?").run(data)
            get_cat()
        }
    })
    socket.on("update_cat", data => {
        db.prepare("UPDATE kategori SET cat_name = ? WHERE id = ?").run(data.name, data.id)
        get_cat()
    })
    socket.on("update_subcat", data => {
        db.prepare("UPDATE kategori SET cat_name = ? WHERE id = ?").run(data.name, data.id)
        const item_data = db.prepare("SELECT * FROM kategori WHERE id = ?").get(data.id)
        get_subcat(item_data["cat_parent"])
    })
    socket.on("record", data => {
        //(id INTEGER PRIMARY KEY AUTOINCREMENT, acc_id INTEGER, cat_id INTEGER, flow INTEGER, amount NUMERIC)
        //socket.emit("record", { type: rec_type, cat: rec_cat.value, subcat: rec_subcat.value, val: rec_val.value })
        //get the active account / in use
        let datenow = new Date
        let gettime = datenow.getTime()
        const acc = db.prepare("SELECT * FROM account WHERE last_use = ?").get("1")
        db.prepare("INSERT INTO balance (acc_id, cat_id, flow, amount, datetime) VALUES (?, ?, ?, ?, ?)").run(acc["id"], data.subcat, data.type, data.val, gettime)
        let newbal = acc["balance"]
        let newusage = acc["usage"]
        let newincome = acc["income"]
        if (data.type == 0) {
            newbal -= Number(data.val)
            newusage += Number(data.val)
        }
        else if (data.type == 1) {
            newbal += Number(data.val)
            newincome += Number(data.val)
        }
        db.prepare("UPDATE account SET balance = ?, usage = ?, income = ? WHERE id = ?").run(newbal.toFixed(2), newusage, newincome, acc["id"])
        use_account()
    })
    socket.on("account_list", () => {
        get_account()
    })
    socket.on("add_acc", data => {
        db.prepare("INSERT INTO account (acc_name, balance, usage, income) VALUES (?, ?, ?, ?)").run(data.name, data.amount, "0", "0")
        get_account()
    })
    socket.on("del_acc", data => {
        const acc = db.prepare("SELECT COUNT(*) FROM account").get()
        if (acc["COUNT(*)"] > 1) {
            db.prepare("DELETE FROM account WHERE id = ?").run(data)
            get_account()
        }
    })
    socket.on("use_account", data => {
        use_account(data)
    })
    socket.on("acc_rename", data => {
        db.prepare("UPDATE account SET acc_name = ? WHERE id = ?").run(data.name, data.id)
        get_account()
    })
    socket.on("adj_acc", data => {
        db.prepare("UPDATE account SET balance = ? WHERE id = ?").run(data.bal, data.id)
        get_account()
    })
    socket.on("get_info", data => {
        const record = db.prepare("SELECT * FROM balance WHERE id = ?").get(data)
        const cat = db.prepare("SELECT * FROM kategori").all()
        socket.emit("edit_info", { rec: record, cat: cat })
    })
    socket.on("save_rec", data => {
        //make the id reset the account
        const get_rec = db.prepare("SELECT * FROM balance WHERE id = ?").get(data.id)
        const get_acc = db.prepare("SELECT * FROM account WHERE id = ?").get(get_rec["acc_id"])
        let new_bal = get_acc["balance"]
        if (get_rec["flow"]) {
            //flow + so we need to -
            new_bal -= get_rec["amount"]
        }
        else {
            new_bal += get_rec["amount"]
        }
        if (data.type == "0") {
            new_bal -= Number(data.val)
        }
        else {
            new_bal += Number(data.val)
        }
        db.prepare("UPDATE account SET balance = ? WHERE id = ?").run(new_bal.toFixed(2), get_rec["acc_id"])
        db.prepare("UPDATE balance SET amount = ?, flow = ?, cat_id = ? WHERE id = ?").run(Number(data.val).toFixed(2), data.type, data.cat, data.id)
        use_account()
    })



})

http.listen(PORT, () => {
    //http.listen(process.env.PORT, () => {
    console.log("Started")
})

function install_category() {
    console.log("Starting for first time...")
    db.prepare(`INSERT INTO "kategori"("id", "cat_parent", "cat_name") VALUES (1, 0, 'Food & Drinks'),
(2, 0, 'Shopping'),
(3, 0, 'Housing'),
(4, 0, 'Transportation'),
(5, 0, 'Vehicle'),
(6, 0, 'Life & Entertainment'),
(7, 0, 'Communication, PC'),
(8, 0, 'Financial expenses'),
(9, 0, 'Investments'),
(10, 0, 'Income'),
(11, 0, 'Others'),
(12, 1, 'Bar, cafe'),
(13, 1, 'Groceries'),
(14, 1, 'Restaurant, fast-food'),
(15, 2, 'Clothers & shoes'),
(16, 2, 'Drug-store, chemist'),
(17, 2, 'Electronics, accessories'),
(18, 2, 'Free time'),
(19, 2, 'Gifts, joy'),
(20, 2, 'Health and beauty'),
(21, 2, 'Home, garden'),
(22, 2, 'Jewels, accessories'),
(23, 2, 'Kids'),
(24, 2, 'Pets, animals'),
(25, 2, 'Stationery, tools'),
(26, 3, 'Energy, utilities'),
(27, 3, 'Maintenance, repairs'),
(28, 3, 'Mortgage'),
(29, 3, 'Property insurance'),
(30, 3, 'Rent'),
(31, 3, 'Services'),
(32, 4, 'Business trips'),
(33, 4, 'Long distance'),
(34, 4, 'Public transport'),
(35, 4, 'Taxi'),
(36, 5, 'Fuel'),
(37, 5, 'Leasing'),
(38, 5, 'Parking'),
(39, 5, 'Rentals'),
(40, 5, 'Vehicle insurance'),
(41, 5, 'Vehicle maintenance'),
(42, 6, 'Active sport, fitness'),
(43, 6, 'Alcohol, tobacco'),
(44, 6, 'Books, audio, subscriptions'),
(45, 6, 'Charity, gifts'),
(46, 6, 'Culture, sport events'),
(47, 6, 'Education, development'),
(48, 6, 'Health care, doctor'),
(49, 6, 'Hobbies'),
(50, 6, 'Holiday, trips, hotels'),
(51, 6, 'Life events'),
(52, 6, 'Lottery, gambling'),
(53, 6, 'TV, Streaming'),
(54, 6, 'Wellness, beauty'),
(55, 7, 'Internet'),
(56, 7, 'Phone, cell phone'),
(57, 7, 'Postal services'),
(58, 7, 'Software, apps, games'),
(59, 8, 'Advisory'),
(60, 8, 'Charges, fees'),
(61, 8, 'Child Support'),
(62, 8, 'Fines'),
(63, 8, 'Insurances'),
(64, 8, 'Loan, interests'),
(65, 8, 'Taxes'),
(66, 9, 'Collections'),
(67, 9, 'Financial investments'),
(68, 9, 'Realty'),
(69, 9, 'Savings'),
(70, 9, 'Vehicles, chattels'),
(71, 10, 'Checks, cuppons'),
(72, 10, 'Child Support'),
(73, 10, 'Dues & grants'),
(74, 10, 'Gifts'),
(75, 10, 'Interests, dividends'),
(76, 10, 'Leanding, renting'),
(77, 10, 'Lottery, gambling'),
(78, 10, 'Refund (tax, purchase)'),
(79, 10, 'Rental income'),
(80, 10, 'Sale'),
(81, 10, 'Wage, invoices'),
(82, 11, 'Missing');`).run()
}
