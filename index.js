import express from 'express'
 import 'dotenv/config' 
import cors from "cors"
const app = express()
const PORT = 8000


app.use(cors())
app.use(express.json())


import { MongoClient, ObjectId } from 'mongodb';

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






app.post('/add-studio', async (req,res)=>{
    const data = req.body

    const result = await studioCollection.insertOne(data)
    console.log(result);
    res.send({result})
})


app.get('/studios',async(req,res)=>{
    const result = await studioCollection.find().toArray()
    res.send(result)
})

app.get('/studios/:id', async (req, res) => {

    const {id}=req.params
    const result = await studioCollection.findOne({_id: new ObjectId(id)})
    res.send(result)
})

    


app.get('/',(req,res)=>{
    res.send({message: 'Server is running fine!'})
})


app.listen(PORT,()=>{
    console.log(`Server is running at ${PORT}`);
})