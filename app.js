/**
 * Created by sagar.gohil on 18-04-2017.
 */

var restify = require('restify');
var builder = require('botbuilder');
var dateFormat = require('dateformat');
var o = require('odata');
var poData = [];

const {Wit, log} = require('node-wit');

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: '658edbf6-6185-4f2b-af1f-98d136ae4dc0',
    appPassword:'KEt5dNdZRkhHqdpwMufnHVs'
});

var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

//=========================================================
// Bots Dialogs
//=========================================================

var Enum = require('enum');
var rootFlow = new Enum(['payment', 'issue','Yes','No','Reset', 'StartGreeting'],{ignoreCase:true});
const client = new Wit({accessToken: 'OMA6J3GMQV43OCFXKIA3QKP7BJQCFDBT'});

var userAddress= {};

/*
var recognizer = new builder.LuisRecognizer('https://eastus2.api.cognitive.microsoft.com/luis/v2.0/apps/e52f3664-4bf6-4ca4-8c47-70a64301a866?subscription-key=8a9e130238094022b9fd0f71e02df48b&timezoneOffset=0&verbose=true&q=');
bot.recognizer(recognizer);
*/

// On Error
bot.on('error', function(message) {
    console.log('[error] called'+message);
});

bot.on('conversationUpdate', function (message) {
    console.log("Called Conversation updated");
    if (message.membersAdded && message.membersAdded.length > 0) {
        var isSelf = false;
        var membersAdded = message.membersAdded
            .map(function (m) {
                isSelf = m.id === message.address.bot.id;
                return (isSelf ? message.address.bot.name : m.name) || '' + ' (Id: ' + m.id + ')';
            })
            .join(', ');
        if (!isSelf) {
            console.log("not self");
            bot.send(new builder.Message()
                .address(message.address)
                .text('Welcome ' + membersAdded + "! How can I help you?"));
            bot.beginDialog(message.address,'/');
        }
    }
});

Date.prototype.addDays = function(days) {
    this.setDate(this.getDate() + parseInt(days));
    return this;
};



// Root dialog for entry point in application
bot.dialog('/', [
    function (session,args, next) {
        result = args || {};
        if (result == undefined || result.response == undefined) {
            userAddress = session.message.address;
            builder.Prompts.text(session, "Hi " + session.message.user.name + " How can i help you?");
        }
        else if (result.response == "NU") {
            builder.Prompts.text(session, "You can say : 'Analytics'");
        }
    },
    function (session, results) {

        // Changes suggested by rakhi for demo 04-05-2017
        /*var data = {};
        data.response = results.response.entity;
        RootMenu(session, data);*/
        // End

        RootMenu(session,results);
    },
    function (session,results) {
        console.log("root final : " + results.response);
        RootMenu(session,results);
    }
]);

function RootMenu(session,results) {
    //const client = new Wit({accessToken: 'OMA6J3GMQV43OCFXKIA3QKP7BJQCFDBT'});
    client.message(results.response, {}).then((data) => {

        var intentData = data.entities.intent != undefined ? data.entities.intent[0] : {};

        /*if (rootFlow.payment.is(intentData.value)) {
         if (data.entities.PaymentType != undefined) {
         session.conversationData.paymentType = data.entities.PaymentType[0].value;
         }

         if (data.entities.InvoiceNo != undefined) {
         session.conversationData.invoiceNo = data.entities.InvoiceNo[0].value;
         }

         session.beginDialog('/payment', results.response);
         }*/

        if (results.response.toUpperCase().indexOf("ANALYTICS") !== -1) {
            session.beginDialog('/Analytics');
        }
        else if (results.response.toUpperCase().indexOf("PO") !== -1) {
            session.beginDialog('/POFlow');
        }
        else if (results.response.toUpperCase().indexOf("NO") != -1) {
            session.send("Ok then " + session.message.user.name + ", Goodbye :)");
            session.endDialog();
        }
        else if (results.response.toUpperCase().indexOf("YES") != -1) {
            session.beginDialog('/Analytics');
        } else {
            session.send("Not Trained...");
            session.beginDialog('/', {response: 'NU'});
        }
    })
        .catch(console.error);
}

bot.dialog('/Analytics',[
    function (session,args) {
        builder.Prompts.choice(session, "Please select a dashboard", "CPO Dashboard|Supplier Visibility|Manager Dashboard|Supplier Compliance",
            {
                listStyle: builder.ListStyle.button,
                maxRetries: 2,
                retryPrompt: 'Please Provide analytics dashboard'
            });
    },
    function (session,results) {
        if (results.response == undefined) {
            session.endDialog();
            session.replaceDialog('/');
        }
        else {
            var option = results.response.entity;
            var cards = {};
            if (option.toUpperCase().indexOf("CPO") !== -1) {
                cards = CreateCPOCards();
            }
            else if (option.toUpperCase().indexOf("VISIBILITY") !== -1) {
                cards = CreateSupplierVisibilityCards();
            }
            else if (option.toUpperCase().indexOf("MANAGER") !== -1) {
                cards = CreateManagerDashboardCards();
            }
            else if (option.toUpperCase().indexOf("COMPLIANCE") !== -1) {
                cards = CreateSupplierComplianceCards();
            }

            var reply =
                new builder.Message()
                    .attachmentLayout(builder.AttachmentLayout.carousel)
                    .attachments(cards);

            session.send(reply);

            session.beginDialog('/ConversationEnd');
        }
    },
    function (session,results) {
        session.endDialogWithResult(results);
    }
])

bot.dialog('/POFlow',[
    function (session,args,next) {
        if (!session.dialogData.isDetailShown) {
            getPOList(function (poList) {
                console.log(JSON.stringify(poList));

                if (poList !== undefined) {
                    builder.Prompts.choice(session, "Please select a PO", poList,
                        {
                            listStyle: builder.ListStyle.button,
                            maxRetries: 2,
                            retryPrompt: 'Please provide PoNumber'
                        });
                }
            });
        }
        else {
            next();
        }
    },
    function (session,results,next) {
        if (!session.dialogData.isDetailShown) {
            getPODetails(results.response.entity, function (objDetails) {
                session.dialogData.poDetails = objDetails;
                session.send("Following are the details of your purchase order");
                session.send("PO No : " + objDetails.PoNumber + "\n\nComp Code : " + objDetails.CompCode + "\n\nPo Unit: 3" + objDetails.PoUnit + "\n\nVendor : " + objDetails.Vendor + "\n\nQuantity   :  " + objDetails.Quantity);
                session.dialogData.isDetailShown = true;
                builder.Prompts.text(session, "Do you want to update this?");
            });
        }
        else {
            next();
        }
    },
    function (session,results,next) {
        if (!session.dialogData.qntyValidated) {
            client.message(results.response, {}).then((data) => {
                var intentData = data.entities.intent != undefined ? data.entities.intent[0] : {};
                if (rootFlow.No.is(intentData.value)) {
                    session.beginDialog('/ConversationEnd');
                }
                else {
                    builder.Prompts.text(session, "How many more Quantity you want?");
                }

            })
                .catch(console.error);
        }
        else {
            next();
        }
    },
    function (session,results) {
        var newQnty = parseInt(results.response, 10);
        if (session.dialogData.poDetails.Quantity >= newQnty) {
            // validation failed
            session.dialogData.qntyValidated = false;
            session.replaceDialog('/POFlow');
        }
        else {
            session.dialogData.qntyValidated = true;
            //validation success
        }
    }
]);

// get details based on poNumber
function getPODetails(poNumber,cb) {
// user poData for further details
    var objDetails = {};
    for (var i = 0, len = poData.length; i < len|| i<=5; i++) {
        if (poData[i].PoNumber === poNumber) {
            objDetails = poData[i];
            break;
        }
    }
    cb(objDetails);
}

//call odata service and get list of po
function getPOList(cb) {
// set an endpoint
    o().config({
        endpoint: 'http://alinhana9.bcone.com:8002/sap/opu/odata/sap/ZINFA_PO_SRV/',
        username: 'TRAIN128_A21',
        password: 'bcone@123',
        isAsync:true
    });
    o('POSet').get(function (data) {
        //same result like the first example on this page
        console.log('service response :->    ' + JSON.stringify(data));
        var result = data.d.results;
        poData = result;
        var poList = [];

         for (var i = 0, len = result.length; i < len && i<=5; i++) {
             poList.push(result[i].PoNumber);
         }
        cb(poList);
    });
}

bot.dialog('/ConversationEnd',[
    function (session) {
        session.conversationData  = {};
        builder.Prompts.text(session, 'Would you like to see another dashboard?');
    }
]);

//check if reset/exit
bot.dialog('/Reset', [
function (session,response) {
    session.beginDialog('/');
}
])

// To Clear user Data cache
bot.dialog('/ClearData', [
    function (session) {
        session.userData.isVerified = false;
        session.beginDialog('/ConversationEnd');
    }
]);

function CreateCPOCards(session) {
    return[
        CreateCard(session, 'SpendAnalytics','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/SpendTrend.PNG'),
        CreateCard(session,'Top 10 Companies','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/T10Companies.PNG'),
        CreateCard(session,'Top 10 Suppliers','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/T10Suppliers.PNG'),
        CreateCard(session,'Top 10 Spend Analytics','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/T10SpendCategories.PNG')
    ];
}

function CreateSupplierVisibilityCards(session) {
    return[
        CreateCard(session,'Top 10 Materials','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/T10Materials.PNG'),
        CreateCard(session,'Top 10 Plants','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/T10Plant.PNG'),
        CreateCard(session,'Top 10 Suppliers','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/T10Suppliers2.PNG')
    ];
}

function CreateManagerDashboardCards(session) {
    return[
        CreateCard(session,'Direct vs Indirect','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/DIRECTvsINDIRECT.PNG'),
        CreateCard(session,'Non Po Profiling','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/NON_PO_PROFILING.PNG'),
        CreateCard(session,'Off Contract Profiling','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/OFF_CONTRACT_PROFILING.PNG'),
        CreateCard(session,'Payment Term Inconsistencies','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/PAYMENT_TERM_INCONSISTENCIES.PNG'),
        CreateCard(session,'After The Fact Spend','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/AFTER_THE_FACT_SPEND.PNG')
    ];
}

function CreateSupplierComplianceCards(session) {
    return[
        CreateCard(session,'Actual vs Budgeted','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/ACTUALvsBUDGETED.PNG'),
        CreateCard(session,'Direct vs Indirect','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/DIRECTvsINDIRECT2.PNG'),
        CreateCard(session,'Send Category Analysis','Sample Text for demo','sample subtitle','https://cuianalytics.blob.core.windows.net/c1analytics/SENDCATEGORY_ANALYSIS.PNG')
    ];
}

function CreateCard(session,title,text,subtitle,imageURL) {
   return new builder.HeroCard(session)
       .title(title)
       /*.subtitle(subtitle)
       .text(text)*/
       .images([
           builder.CardImage.create(session, imageURL)
       ])
       .buttons([
           builder.CardAction.openUrl(session, imageURL, 'See More')
           /*,builder.CardAction.openUrl(session, 'http://neo.bcone.com/sense/app/edc8d0e8-ce10-4160-9ba7-25b63904c653/sheet/JkmJaP/state/analysis', 'Go To')*/
       ])
}