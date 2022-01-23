
var express = require('express');
var app = express();
var dotenv = require('dotenv');
var mongo = require('mongodb');
var mongoose = require('mongoose')
var cors = require('cors')
const bodyParser = require('body-parser')

const https = require("https");
const qs = require("querystring");
const checksum_lib = require("./paytm/checksum");
const config = require("./paytm/config");

dotenv.config();
var mongoUrl = "mongodb+srv://edumato:edumato@cluster0.uetk6.mongodb.net/edumato?retryWrites=true&w=majority";
var port = process.env.PORT || 5001;
var MongoClient = mongo.MongoClient;
var db;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

const AuthController = require('./login/auth/authController');
app.use('/api/auth', AuthController)


// first default route
app.get('/', (req, res) => {
    res.send("Hiii From Express")
})


// return all the city
app.get('/location', (req, res) => {

    db.collection('location').find().toArray((err, result) => {
        if (err) throw err;
        res.send(result)
    })
})

// return all the mealType
app.get('/mealtype', (req, res) => {
    db.collection('mealtype').find().toArray((err, result) => {
        if (err) throw err;
        res.send(result)
    })
})


// return all the restaurants
// app.get('/resturants',(req,res) => {
//     db.collection('resturants').find().toArray((err,result) => {
//         if(err) throw err;
//         res.send(result)
//     })
// })

// restaurant wrt to id
app.get('/restaurant/:id', (req, res) => {
    var id = parseInt(req.params.id);
    db.collection('restaurants').find({ "restaurant_id": id }).toArray((err, result) => {
        if (err) throw err;
        res.send(result)
    })
})

// query params example
/// wrt to city_name
app.get('/restaurants', (req, res) => {
    var query = {};
    if (req.query.city) {
        query = { state_id: Number(req.query.city) }
    }
    db.collection('restaurants').find(query).toArray((err, result) => {
        if (err) throw err;
        res.send(result)
    })
})

// restaurant wrt to mealId
app.get('/filter/:mealId', (req, res) => {
    var id = parseInt(req.params.mealId);
    var sort = { cost: 1 }
    var skip = 0;
    var limit = 1000000000000
    var query = { "mealTypes.mealtype_id": id };
    if (req.query.sortKey) {
        var sortKey = req.query.sortKey
        if (sortKey > 1 || sortKey < -1 || sortKey == 0) {
            sortKey = 1
        }
        sort = { cost: Number(sortKey) }
    }
    if (req.query.skip && req.query.limit) {
        skip = Number(req.query.skip)
        limit = Number(req.query.limit)
    }

    if (req.query.lcost && req.query.hcost) {
        var lcost = Number(req.query.lcost);
        var hcost = Number(req.query.hcost);
    }

    if (req.query.cuisine && req.query.lcost && req.query.hcost) {
        query = {
            $and: [{ cost: { $gt: lcost, $lt: hcost } }],
            "cuisines.cuisine_id": Number(req.query.cuisine),
            "mealTypes.mealtype_id": id
        }
    }
    else if (req.query.cuisine) {
        query = { "mealTypes.mealtype_id": id, "cuisines.cuisine_id": Number(req.query.cuisine) }
        // query = {"mealTypes.mealtype_id":id,"cuisines.cuisine_id":{$in:[2,5]}}
    } else if (req.query.lcost && req.query.hcost) {
        query = { $and: [{ cost: { $gt: lcost, $lt: hcost } }], "mealTypes.mealtype_id": id }
    }

    db.collection('restaurants').find(query).sort(sort).skip(skip).limit(limit).toArray((err, result) => {
        if (err) throw err;
        res.send(result)
    })
})

// return all the menu
app.get('/menu/:restid', (req, res) => {
    var restid = Number(req.params.restid)
    db.collection('menu').find({ restaurant_id: restid }).toArray((err, result) => {
        if (err) throw err;
        res.send(result)
    })
})

app.post('/menuItem', (req, res) => {
  
    db.collection('menu').find({ menu_id: { $in: req.body } }).toArray((err, result) => {
        if (err) throw err;
        res.send(result)
    })

})

app.put('/updateStatus/:id', (req, res) => {
    var id = Number(req.params.id);
    var status = req.body.status ? req.body.status : "Pending"
    db.collection('orders').updateOne(
        { id: id },
        {
            $set: {
                "date": req.body.date,
                "bank_status": req.body.bank_status,
                "bank": req.body.bank,
                "status": status
            }
        }
    )
    res.send('data updated')
})

// return all the orders
app.get('/orders', (req, res) => {
    db.collection('orders').find().toArray((err, result) => {
        if (err) throw err;
        res.send(result)
    })
})

app.post('/placeOrder', (req, res) => {
    db.collection('orders').insert(req.body, (err, result) => {
        if (err) throw err;
        res.send("order placed")
    })
})

app.delete('/deletOrders', (req, res) => {
    db.collection('orders').remove({}, (err, result) => {
        if (err) throw err;
        res.send(result)
    })
})


/// patym /////

const parseUrl = express.urlencoded({ extended: false });
const parseJson = express.json({ extended: false });


app.post("/paynow", [parseUrl, parseJson], (req, res) => {
    // Route for making payment
   
    var paymentDetails = {
        orderID: req.body.id,
        amount: req.body.cost,
        customerId: req.body.name,
        customerEmail: req.body.email,
        customerPhone: req.body.phone,
        customerRest: req.body.rest_name
    }
    if (!paymentDetails.amount || !paymentDetails.customerId || !paymentDetails.customerEmail || !paymentDetails.customerPhone || !paymentDetails.customerRest) {
        res.status(400).send('Payment failed')
    } else {
        var params = {};
        params['MID'] = config.PaytmConfig.mid;
        params['WEBSITE'] = config.PaytmConfig.website;
        params['CHANNEL_ID'] = 'WEB';
        params['INDUSTRY_TYPE_ID'] = 'Retail';
        params['ORDER_ID'] = 'TEST_' + paymentDetails.orderID;
        params['CUST_ID'] = paymentDetails.customerId;
        params['TXN_AMOUNT'] = paymentDetails.amount;
        params['CALLBACK_URL'] = 'http://localhost:5000/callback';
        params['EMAIL'] = paymentDetails.customerEmail;
        params['MOBILE_NO'] = paymentDetails.customerPhone;


        checksum_lib.genchecksum(params, config.PaytmConfig.key, function (err, checksum) {
            var txn_url = "https://securegw-stage.paytm.in/theia/processTransaction"; // for staging
            // var txn_url = "https://securegw.paytm.in/theia/processTransaction"; // for production

            var form_fields = "";
            for (var x in params) {
                form_fields += "<input type='hidden' name='" + x + "' value='" + params[x] + "' >";
            }
            form_fields += "<input type='hidden' name='CHECKSUMHASH' value='" + checksum + "' >";

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.write('<html><head><title>Merchant Checkout Page</title></head><body><center><h1>Please do not refresh this page...</h1></center><form method="post" action="' + txn_url + '" name="f1">' + form_fields + '</form><script type="text/javascript">document.f1.submit();</script></body></html>');
            res.end();
        });
    }
});

app.post("/callback", (req, res) => {

    // Route for verifiying payment
 
    // const form = new formidable.IncomingForm()
    let paytmchecksum = req.body.CHECKSUMHASH
    let params = {};
    let verifysig = checksum_lib.verifychecksum(req.body, config.PaytmConfig.key, paytmchecksum)
   

    if (verifysig) {
        params['MID'] = req.body.MID;
        params['ORDERID'] = req.body.ORDERID;

        checksum_lib.genchecksum(params, config.PaytmConfig.key, function (err, checksum) {
            params["CHECKSUMHASH"] = checksum;

            let post_data = JSON.stringify(params);

            var options = {
                hostname: 'securegw-stage.paytm.in', // for staging
                // hostname: 'securegw.paytm.in', // for production
                port: 443,
                path: '/order/status',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': post_data.length
                }
            };

            var response = "";
            var post_req = https.request(options, function (post_res) {
                post_res.on('data', function (chunk) {
                    response += chunk;
                });



                post_res.on('end', function () {
                    var _results = JSON.parse(response);

                    res.redirect(`http://localhost:3000/viewBooking?status=${_results.STATUS}&ORDERID=${_results.ORDERID}&date=${_results.TXNDATE}&bank=${_results.BANKNAME}`)
                });
            });

            // post the data
            post_req.write(post_data);
            post_req.end();
        })
    } else {
        
    }


});


// connecting with mongodb

MongoClient.connect(mongoUrl, (err, client) => {
    if (err) console.log(err);
    db = client.db('edumato');
    app.listen(port, () => {
        console.log(`listening on port ${port}`)
    })
})


// connecting with mongoose

mongoose.connect(mongoUrl)
