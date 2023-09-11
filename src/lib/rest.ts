import express from 'express';

const app = express();


// Middleware to parse JSON requests
app.use(express.json());

// Route for the homepage (root path)
app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// Route for health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Route for favicon.ico (you can provide a favicon file)
app.get('/favicon.ico', (req, res) => {
  // Replace 'favicon.ico' with the path to your favicon file
  //res.sendFile(__dirname + '/favicon.ico');
  res.status(200);
});

// Error handling middleware
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).send('Something went wrong!');
// });

export default app;
