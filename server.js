const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Clearwater Network server is running!');
});

app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});