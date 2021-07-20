const cors = require("cors");
const express = require("express");
const bodyParser = require("body-parser");

const app = express();

app.use(cors());
// parsing application/json
app.use(bodyParser.json()); 
// parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true })); 

const port = process.env.APP_PORT || 3000;
app.listen(port, function () {
	console.log("Server is running on port " + port + "...");
	console.log(`Open http://localhost:${port} in browser`);
});

const firebase = require("firebase");

firebase.initializeApp({
	//apiKey: "YOUR_API_KEY",
	//sample db, full read/write access (test mode)
	projectId: "scheduler-4f169"
});

const db = firebase.firestore(); 

const event_data = require("./data.json");
const calendar_data = require("./calendars.json");
const unit_data = require("./units.json");
const section_data = require("./sections.json");

const events = db.collection("events");
const calendars = db.collection("calendars");
const units = db.collection("units");
const sections = db.collection("sections");

//populate firestore with default data (if empty)
events.get().then((c) => {
	const batch = db.batch();

	if (c.empty) {
		event_data.forEach((doc) => {
			const docRef = events.doc(doc.id);
			batch.set(docRef, doc);
		});
		batch.commit();
	};
});

calendars.get().then((c) => {
	const batch = db.batch();

	if (c.empty) {
		calendar_data.forEach((doc) => {
			const docRef = calendars.doc(doc.id);
			batch.set(docRef, doc);
		});
		batch.commit();
	};
});

units.get().then((c) => {
	const batch = db.batch();

	if (c.empty) {
		unit_data.forEach((doc) => {
			const docRef = units.doc(doc.id);
			batch.set(docRef, doc);
		});
		batch.commit();
	};
});

sections.get().then((c) => {
	const batch = db.batch();

	if (c.empty) {
		section_data.forEach((doc) => {
			const docRef = sections.doc(doc.id);
			batch.set(docRef, doc);
		});
		batch.commit();
	};
});

app.get("/events", (req, res, next) => {
	const from = req.query.from;
	const to = req.query.to;

	if (from && to) {
		const q = events.where("start_date", "<", req.query.to).get();
		
		const sq1 = events.where("end_date", ">=", req.query.from).get();
		const sq2 = events.where("series_end_date", ">=", req.query.from).get();
		//compound queries require composite indices in the firestore
		const sq3 = events.where("recurring", "!=", "").where("series_end_date", "==", "").get();

		Promise.all([q, sq1, sq2, sq3])
		.then((data) => {
			let evs = [];

			if (data[0].size && (data[1].size || data[2].size || data[3].size)) {

				data.forEach((qs) => {
					evs = evs.concat(qs.docs.map(doc => doc.data()));
				});
			};

			res.send(evs);
		})
		.catch((err) => {
			next(err);
		});
	} else {
		events.orderBy("start_date", "asc").get()
		.then((data) => {
			res.send(data.docs.map(doc => doc.data()));
		})
		.catch((err) => {
			next(err);
		});
	}
});

const allowedFields = [
	"start_date",
	"end_date",
	"all_day",
	"text",
	"details",
	"color",
	"recurring",
	"calendar",
	"origin_id",
	"series_end_date",
	"units",
	"section"
];

app.put("/events/:id", (req, res, next) => {
	const event = {};
	for (let f in req.body){
		if (allowedFields.indexOf(f) !== -1) event[f] = req.body[f];
	}

	events.doc(req.params.id).update(req.body)
	.then(() => {
		const mode = req.body.recurring_update_mode;
			if (mode === "all"){
				// remove all sub-events
				events.where("origin_id", "==", req.params.id).get()
				.then((qs) => {
					qs.forEach((doc) => {
						events.doc(doc.id).delete();
					});
		
					res.send({});
				})
				.catch((err) => {
					next(err);
				});
			} else if (mode === "next"){
				// remove all sub-events after new 'this and next' group
				const date = req.body.recurring_update_date;
				if (!date) {
					next("date must be provided");
				} else {
					// in case update came for a subevent, search the master event

					events.where("id", "==", req.params.id).where("origin_id", "!=", "0").get()
					.then((qs) => {
						let id = req.params.id;

						if (!qs.empty) {
							qs = qs.docs.map(doc => doc.data());
							id = qs[0].origin_id;
						};

						events.where("origin_id", "==", id).where("start_date", ">=", date).get()
						.then((qs_) => {

							qs_.forEach((doc) => {
								events.doc(doc.id).delete();
							});
				
							res.send({});
						})
						.catch((err) => {
							next(err);
						});
					}).catch((err) => {
						next(err);
					});

				}
			} else {
				res.send({});
			}
	})
	.catch((err) => {
		next(err);
	});

});

app.delete("/events/:id", (req, res, next) => {
	events.doc(req.params.id).delete()
	.then(() => {
		events.where("origin_id", "==", req.params.id).get()
		.then((qs) => {
			qs.forEach((doc) => {
				events.doc(doc.id).delete();
			});

			res.send({});
		});
	})
	.catch((err) => {
		next(err);
	});
});

app.post("/events", (req, res, next) => {
	const event = {};
	for (let f in req.body){
		if (allowedFields.indexOf(f) !== -1) event[f] = req.body[f];
	}

	const doc = events.doc();
	event.id = doc.id;

	doc.set(event)
	.then(() => {
		res.send({ id: doc.id });
	})
	.catch((err) => {
		next(err);
	});

});

app.get("/calendars", (req, res, next) => {
	calendars.get()
	.then((data) => {
		res.send(data.docs.map(doc => doc.data()));
	})
	.catch((err) => {
		next(err);
	});
});

app.put("/calendars/:id", (req, res, next) => {
	calendars.doc(req.params.id).update(req.body)
	.then(() => {
		res.send({});
	})
	.catch((err) => {
		next(err);
	});
});

app.delete("/calendars/:id", (req, res, next) => {
	calendars.doc(req.params.id).delete()
	.then(() => {
		events.where("calendar", "==", req.params.id).get()
		.then((qs) => {
			qs.forEach((doc) => {
				events.doc(doc.id).delete();
			});

			res.send({});
		});
	})
	.catch((err) => {
		next(err);
	});
});

app.post("/calendars", (req, res, next) => {
	const cal = req.body;
	const doc = calendars.doc();
	cal.id = doc.id;

	doc.set(cal)
	.then(() => {
		res.send({ id: doc.id });
	})
	.catch((err) => {
		next(err);
	});
});

app.get("/units", (req, res, next) => {
	units.get()
	.then((data) => {
		res.send(data.docs.map(doc => doc.data()));
	})
	.catch((err) => {
		next(err);
	});
});

app.get("/sections", (req, res, next) => {
	sections.get()
	.then((data) => {
		res.send(data.docs.map(doc => doc.data()));
	})
	.catch((err) => {
		next(err);
	});
});