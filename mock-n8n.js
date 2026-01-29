// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express');
const app = express();
const port = 5678; // n8n default port

app.use(express.json());

app.post('/webhook/webhook-test/generate', (req, res) => {
  console.log('Received generate request:', req.body);

  const { prompt, tone, wantImage, contentSource } = req.body;

  // Generate mock response
  const response = {
    title: `AI Generated Post - ${tone || 'Professional'}`,
    post_content: `🚀 Exciting news! Just discovered something amazing about "${prompt || 'your topic'}". 

This ${contentSource || 'text'} content has opened my eyes to new possibilities. The ${tone || 'professional'} approach really makes this stand out.

What are your thoughts on this? Let's discuss in the comments! 💬

#Innovation #Growth #LinkedIn`,
    image_url: wantImage ? 'https://picsum.photos/1200/630?random=' + Date.now() : null
  };

  res.json(response);
});

app.post('/webhook/webhook-test/approve', (req, res) => {
  console.log('Received approve request:', req.body);

  // Mock approval response
  res.json({ success: true, message: 'Post approved successfully' });
});

app.listen(port, () => {
  console.log(`Mock n8n server running at http://localhost:${port}`);
  console.log(`Webhook URLs:`);
  console.log(`  Generate: http://localhost:${port}/webhook/webhook-test/generate`);
  console.log(`  Approve: http://localhost:${port}/webhook/webhook-test/approve`);
});
