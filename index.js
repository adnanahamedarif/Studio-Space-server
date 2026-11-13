import express from 'express'
 import 'dotenv/config' 
import cors from "cors"
import { MongoClient, ObjectId } from "mongodb"
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose'


const app = express()
const PORT = 8000


app.use(cors())
app.use(express.json())



const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient= await connectToMongoDB();

const db = mongoClient.db("studioSpace")
const studioCollection = db.collection("studio")
const bookingCollection = db.collection("bookings")



const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({
      message: "Unauthorized! Token is missing.",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({
      message: "Unauthorized! Invalid token.",
    });
  }

  try {
    const JWKS = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
    );

    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;

    next();

  } catch (error) {
    console.log("JWT Verification Error:", error);

    return res.status(401).send({
      message: "Invalid or expired token.",
    });
  }
};


app.post("/add-studio", verifyToken, async (req, res) => {
  try {
    const data = req.body;

    const result = await studioCollection.insertOne({
      ...data,
      ownerEmail: req.user.email,
      createdAt: new Date(),
    });

    res.status(201).send({
      success: true,
      message: "Studio added successfully!",
      insertedId: result.insertedId,
    });

  } catch (error) {
    console.log("Add Studio Error:", error);

    res.status(500).send({
      message: "Failed to add studio",
    });
  }
});




app.get('/studios',async(req,res)=>{
    const result = await studioCollection.find().toArray()
    res.send(result)
})



app.get('/studios/:id',  async (req, res) => {

    const {id}=req.params
    const result = await studioCollection.findOne({_id: new ObjectId(id)})
    res.send(result)
})



app.post("/booking",verifyToken, async (req, res) => {
  try {
    const { studioId, bookingDate, startTime, endTime, message } = req.body;

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).send({ message: "Invalid studio ID" });
    }

    const studio = await studioCollection.findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).send({ message: "Studio not found" });
    }

    const start = startTime.split(":").map(Number);
    const end = endTime.split(":").map(Number);

    const totalHours =
      ((end[0] * 60 + end[1]) - (start[0] * 60 + start[1])) / 60;

    if (
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
      totalHours <= 0
    ) {
      return res.status(400).send({ message: "Invalid booking time" });
    }

    const existingBooking = await bookingCollection.findOne({
      studioId,
      bookingDate,
      status: "Confirmed",
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });

    if (existingBooking) {
      return res.status(409).send({ message: "Time slot already booked" });
    }

    const bookingData = {
      studioId,
      studioTitle: studio.title,
      studioImage: studio.images?.[0] || "",
      location: studio.location,
      customerEmail: req.user.email,
      hostEmail: studio.ownerEmail,
      bookingDate,
      startTime,
      endTime,
      totalHours,
      hourlyRate: Number(studio.hourlyRate),
      securityDeposit: Number(studio.securityDeposit),
      totalPrice:
        Number(studio.hourlyRate) * totalHours +
        Number(studio.securityDeposit),
      message: message || "",
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await bookingCollection.insertOne(bookingData);

    res.status(201).send({
      success: true,
      bookingId: result.insertedId,
      message: "Booking successful!",
    });

  } catch (error) {
    res.status(500).send({ message: "Booking failed" });
  }
});




app.get("/my-bookings", verifyToken, async (req, res) => {
  const email = req.user.email;

  const bookings = await bookingCollection
    .find({ customerEmail: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.status(200).send({
    success: true,
    bookings,
  });
});




app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
  const { id } = req.params
  const { customerEmail } = req.body

  const result = await bookingCollection.updateOne(
    {
      _id: new ObjectId(id),
      customerEmail: customerEmail,
      status: "Pending"
    },
    {
      $set: {
        status: "Cancelled",
        cancelledAt: new Date()
      }
    }
  )
  res.send({
    success: true,
    message: "Booking cancelled successfully!"
  })
})


app.delete("/bookings/:id",verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.query;

    if (!email) {
      return res.status(400).send({
        message: "Customer email is required",
      });
    }

    const result = await bookingCollection.deleteOne({
      _id: new ObjectId(id),
      customerEmail: email,
    });

    res.send({
      success: true,
      message: "Booking deleted successfully!",
    });

  } catch (error) {
    console.error("Delete booking error:", error);

    res.status(500).send({
      message: "Failed to delete booking",
    });
  }
});




app.get("/my-listings", verifyToken, async (req, res) => {
  const ownerEmail = req.user.email;

  const studios = await studioCollection
    .find({ ownerEmail })
    .sort({ _id: -1 })
    .toArray();

  res.status(200).send({
    success: true,
    studios,
  });
});


app.delete("/my-listings/:id", verifyToken, async (req, res) => {
  const id = req.params.id
  const email = req.user.email

  const result = await studioCollection.deleteOne({
    _id: new ObjectId(id),
    ownerEmail: email,
  })

  res.send({
    success: result.deletedCount > 0,
    message: "Studio deleted successfully!",
  })
})




app.patch("/studios/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const email = req.user.email;

  const {
    title,
    category,
    location,
    hourlyRate,
    securityDeposit,
    capacity,
    images,
    amenities,
    description,
  } = req.body;

  const result = await studioCollection.updateOne(
    {
      _id: new ObjectId(id),
      ownerEmail: email,
    },
    {
      $set: {
        title,
        category,
        location,
        hourlyRate,
        securityDeposit,
        capacity,
        images,
        amenities,
        description,
        updatedAt: new Date(),
      },
    }
  );

  res.send({
    success: result.modifiedCount > 0,
    message: "Studio updated successfully!",
  });
});




app.get("/host-bookings", verifyToken, async (req, res) => {
  const { studioId } = req.query;
  const email = req.user.email;

  const studio = await studioCollection.findOne({
    _id: new ObjectId(studioId),
    ownerEmail: email,
  });

  const bookings = await bookingCollection
    .find({
      studioId: studioId,
      hostEmail: email,
    })
    .sort({ createdAt: -1 })
    .toArray();

  res.status(200).send({
    success: true,
    bookings,
  });
});



app.patch("/bookings/:id/:action", verifyToken, async (req, res) => {
  const { id, action } = req.params;
  const email = req.user.email;

  const result = await bookingCollection.updateOne(
    {
      _id: new ObjectId(id),
      hostEmail: email,
      status: "Pending",
    },
    {
      $set: {
        status: action === "approve" ? "Confirmed" : "Cancelled",
      },
    }
  );

  res.send({
    success: result.modifiedCount > 0,
    message: "Booking updated successfully!",
  });
});




app.get('/',(req,res)=>{
    res.send({message: 'Server is running fine!'})
})


app.listen(PORT,()=>{
    console.log(`Server is running at ${PORT}`);
})


export default app