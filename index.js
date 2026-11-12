import express from 'express'
 import 'dotenv/config' 
import cors from "cors"
import { MongoClient, ObjectId } from "mongodb"


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






app.post("/add-studio",verifyToken, async (req, res) => {
  try {
    const data = req.body

    const result = await studioCollection.insertOne({
      ...data,
      createdAt: new Date()
    })
  } catch (error) {
    console.log(error)

    res.status(500).send({
      success: false,
      message: "Failed to add studio"
    })
  }
})




app.get('/studios',async(req,res)=>{
    const result = await studioCollection.find().toArray()
    res.send(result)
})



app.get('/studios/:id',  async (req, res) => {

    const {id}=req.params
    const result = await studioCollection.findOne({_id: new ObjectId(id)})
    res.send(result)
})



app.post("/booking", async (req, res) => {
  const {
    studioId,
    customerEmail,
    bookingDate,
    startTime,
    endTime,
    message
  } = req.body
  const studio = await studioCollection.findOne({
    _id: new ObjectId(studioId)
  })

  const start = startTime.split(":").map(Number)
  const end = endTime.split(":").map(Number)

  const startMinutes = start[0] * 60 + start[1]
  const endMinutes = end[0] * 60 + end[1]

  if (
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime) ||
    start[0] > 23 || start[1] > 59 ||
    end[0] > 23 || end[1] > 59 ||
    endMinutes <= startMinutes
  ) {
    return res.status(400).send({
      success: false,
      message: "Invalid booking time"
    })
  }

  const totalHours = (endMinutes - startMinutes) / 60

  const hourlyRate = Number(studio.hourlyRate)
  const securityDeposit = Number(studio.securityDeposit)

  if (
    !Number.isFinite(hourlyRate) ||
    !Number.isFinite(securityDeposit) ||
    hourlyRate < 0 ||
    securityDeposit < 0
  ) {
    return res.status(400).send({
      success: false,
      message: "Invalid studio price"
    })
  }

  // Check confirmed booking overlap
  const existingBooking = await bookingCollection.findOne({
    studioId: studioId,
    bookingDate: bookingDate,
    status: "Confirmed",
    startTime: { $lt: endTime },
    endTime: { $gt: startTime }
  })

  if (existingBooking) {
    return res.status(409).send({
      success: false,
      message: "This time slot is already booked"
    })
  }

  const bookingData = {
    studioId: studioId,
    studioTitle: studio.title,
    studioImage: studio.images?.[0] || "",
    location: studio.location,

    customerEmail,
    hostEmail: studio.ownerEmail || "",

    bookingDate,
    startTime,
    endTime,
    totalHours,

    hourlyRate,
    securityDeposit,
    totalPrice: hourlyRate * totalHours + securityDeposit,

    message: message || "",
    status: "Pending",
    createdAt: new Date()
  }

  const result = await bookingCollection.insertOne(bookingData)

  res.status(201).send({
    success: true,
    message: "Booking request submitted successfully!",
    bookingId: result.insertedId
  })
})





app.get("/my-bookings", async (req, res) => {
  const email = req.query.email
  const bookings = await bookingCollection
    .find({ customerEmail: email })
    .sort({ createdAt: -1 })
    .toArray()

  res.send({
    success: true,
    bookings
  })
})




app.patch("/bookings/:id/cancel", async (req, res) => {
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


app.delete("/bookings/:id", async (req, res) => {
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





app.get("/my-listings", async (req, res) => {
  try {
    const ownerEmail = req.query.email

    if (!ownerEmail) {
      return res.status(400).send({
        success: false,
        message: "Owner email is required"
      })
    }

    const studios = await studioCollection
      .find({ ownerEmail: ownerEmail })
      .sort({ _id: -1 })
      .toArray()

    res.send({
      success: true,
      studios: studios
    })

  } catch (error) {
    console.log(error)

    res.status(500).send({
      success: false,
      message: "Failed to load studio listings"
    })
  }
})


app.delete("/my-listings/:id", async (req, res) => {
  try {
    const { id } = req.params
    const ownerEmail = req.query.email


    const result = await studioCollection.deleteOne({
      _id: new ObjectId(id),
      ownerEmail: ownerEmail
    })

    res.send({
      success: true,
      message: "Studio deleted successfully!"
    })

  } catch (error) {
    console.log(error)

    res.status(500).send({
      success: false,
      message: "Failed to delete studio"
    })
  }
})
















app.get('/',(req,res)=>{
    res.send({message: 'Server is running fine!'})
})


app.listen(PORT,()=>{
    console.log(`Server is running at ${PORT}`);
})