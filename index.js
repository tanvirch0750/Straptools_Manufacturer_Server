const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

// verify jwt function
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({
      message: 'unauthorized access',
    });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'forbidden access' });
    } else {
      req.decoded = decoded;
      next();
    }
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dru1h.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const run = async () => {
  try {
    await client.connect();
    console.log('strap server is running');
    const productsCollection = client.db('straptools').collection('products');
    const userCollection = client.db('straptools').collection('users');
    const orderCollection = client.db('straptools').collection('orders');
    const reviewCollection = client.db('straptools').collection('reviews');
    const paymentCollection = client.db('straptools').collection('payments');

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === 'admin') {
        next();
      } else {
        res.status(403).send({ message: 'forbidden' });
      }
    };

    app.get('/', async (req, res) => {
      res.send('server is running');
    });

    // Users
    //post - will use when login and signup
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;

      const filter = { email };
      const options = { upsert: true };

      const updateDoc = {
        $set: user,
      };

      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        {
          expiresIn: '1d',
        }
      );
      res.send({ result, token });
    });

    // to get all the user
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const cursor = userCollection.find(query);
      const users = await cursor.toArray();
      res.send(users);
    });

    // get single user
    app.get('/users/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    // delete user
    app.delete('/users/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // update user
    app.put('/user/profile/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = req.body;

      const filter = { email };
      const options = { upsert: true };

      const updatedDoc = {
        $set: {
          name: user.name,
          image: user.image,
          location: user.location,
          education: user.education,
          linkedin: user.linkedin,
          phone: user.phone,
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // make admin route
    app.put('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const updateDoc = {
        $set: { role: 'admin' },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // check user is admin or not return- true or false
    app.get('/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin });
    });

    // Products
    // post product
    app.post('/products', verifyJWT, verifyAdmin, async (req, res) => {
      const product = req.body;
      const result = await productsCollection.insertOne(product);
      return res.send({ success: true, result });
    });

    // to get all the products
    app.get('/products', async (req, res) => {
      const query = {};
      const cursor = productsCollection.find(query);
      const products = await cursor.toArray();
      res.send(products);
    });

    // get single product from db
    app.get('/products/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const product = await productsCollection.findOne(query);
      res.send(product);
    });

    // update product
    app.put('/products/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const {
        name,
        availableQuantity,
        category,
        description,
        fullDescription,
        minimumOrder,
        image,
        quantity,
        pricePerUnit,
      } = req.body;
      const query = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          name,
          availableQuantity,
          category,
          description,
          fullDescription,
          minimumOrder,
          image,
          quantity,
          pricePerUnit,
        },
      };
      const result = await productsCollection.updateOne(
        query,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // delete product
    app.delete('/products/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    // orders
    // post order
    app.post('/order', verifyJWT, async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      return res.send({ success: true, result });
    });

    //get - to get all the orders by user
    app.get('/order', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;

      if (email === decodedEmail) {
        const query = { email: email };
        const cursor = orderCollection.find(query);
        const orders = await cursor.toArray();
        return res.send(orders);
      } else {
        return res.status(403).send({ message: 'forbidden access' });
      }
    });

    // get all order
    app.get('/orders', verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const cursor = orderCollection.find(query);
      const orders = await cursor.toArray();
      res.send(orders);
    });

    // get- single order product for payment
    app.get('/orders/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(query);
      res.send(order);
    });

    // stripe payment route
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      // const { price } = req.body;
      const order = req.body;
      const price = order.totalPrice;
      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // patch- update order for payment
    app.patch('/order/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
      const orderResult = await paymentCollection.insertOne(payment);
      res.send(updatedDoc);
    });

    // patch- approved order
    app.patch('/order/approved/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          approved: true,
        },
      };
      const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
      res.send(updatedDoc);
    });

    // delete order
    app.delete('/order/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });

    // post review
    app.post('/review', verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      return res.send({ success: true, result });
    });

    // to get all the reviews
    app.get('/review', async (req, res) => {
      const query = {};
      const cursor = reviewCollection.find(query);
      const reviews = await cursor.toArray();
      res.send(reviews);
    });

    // delete review
    app.delete('/review/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
};
run().catch(console.dir);

app.listen(port, () => {
  console.log('Listening to straptools port', port);
});
