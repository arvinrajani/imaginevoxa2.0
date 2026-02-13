// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express');
const app = express();
const port = 5678; // n8n default port

app.use(express.json());

app.post('/webhook/webhook-test/generate', (req, res) => {
  console.log('Received generate request:', req.body);

  const { prompt, tone, wantImage, contentSource } = req.body;
  const topic = typeof prompt === 'string' && prompt.trim().length > 0 ? prompt.trim() : 'your topic';
  const toneKey = typeof tone === 'string' ? tone.toLowerCase() : 'professional';
  const sourceLabel = typeof contentSource === 'string' && contentSource.trim().length > 0
    ? contentSource.trim()
    : 'text';
  const topicTag = topic.replace(/\s+/g, '');

  const postByTone = {
    professional: `${topic} is rarely a one-off tactic. The teams that win treat it like a system.\n\nBased on this ${sourceLabel} input, here is a simple framework that works:\n- Clear ownership\n- Weekly cadence\n- Simple scorecards\n\nIf you are working on ${topic}, try a 10-minute audit:\n1) Define the outcome\n2) Pick one leading metric\n3) Remove one distraction\n\nWhat change moved the needle for you?\n\n#${topicTag} #Leadership #Strategy`,
    casual: `Quick thought on ${topic}.\n\nBased on this ${sourceLabel} input, I would keep it simple:\n- One small win this week\n- Consistency over intensity\n- A quick Friday review\n\nThat is what helped me most.\n\nWhat are you trying right now?\n\n#${topicTag} #RealTalk #Learning`,
    bold: `Hot take on ${topic.toUpperCase()}:\n\nMost advice is optimized for activity, not outcomes.\n\nIf you want results, do the opposite:\n- Say no to "nice-to-have" work\n- Measure one metric that matters\n- Ship, learn, repeat\n\nAgree or disagree?\n\n#${topicTag} #Mindset #Execution`,
  };

  // Generate mock response
  const response = {
    title: `AI Generated Post - ${tone || 'Professional'}`,
    post_content: postByTone[toneKey] || postByTone.professional,
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
