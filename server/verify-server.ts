import axios from 'axios';

async function testNestServer() {
  console.log('Testing Media Library NestJS Server endpoints...');
  const baseUrl = 'http://localhost:8000';
  
  try {
    const settingsRes = await axios.get(`${baseUrl}/api/settings`);
    console.log('GET /api/settings:', settingsRes.status, settingsRes.data);

    const mediaRes = await axios.get(`${baseUrl}/api/media/files`);
    console.log('GET /api/media/files:', mediaRes.status, `total_files: ${mediaRes.data.total_files}`);

    const facesRes = await axios.get(`${baseUrl}/api/faces`);
    console.log('GET /api/faces:', facesRes.status, `faces count: ${facesRes.data.length}`);

    const personsRes = await axios.get(`${baseUrl}/api/faces/persons`);
    console.log('GET /api/faces/persons:', personsRes.status, `persons count: ${personsRes.data.length}`);

    const unrecRes = await axios.get(`${baseUrl}/api/faces/unrecognized`);
    console.log('GET /api/faces/unrecognized:', unrecRes.status, `unrecognized count: ${unrecRes.data.length}`);

    const groupsRes = await axios.get(`${baseUrl}/api/faces/unrecognized-groups`);
    console.log('GET /api/faces/unrecognized-groups:', groupsRes.status, `groups count: ${groupsRes.data.length}`);

    if (unrecRes.data.length > 0) {
      const sampleFace = unrecRes.data[0];
      const imgName = sampleFace.image_path.split(/[/\\]/).pop();
      const imgRes = await axios.get(`${baseUrl}/api/faces/image/${imgName}`);
      console.log(`GET /api/faces/image/${imgName}:`, imgRes.status, `content-type: ${imgRes.headers['content-type']}`);
    }

    const statusRes = await axios.get(`${baseUrl}/api/status`);
    console.log('GET /api/status (proxied or fallback):', statusRes.status, statusRes.data.status);

    const docsRes = await axios.get(`${baseUrl}/api/docs`);
    console.log('GET /api/docs (Swagger UI):', docsRes.status);

    console.log('\nAll NestJS endpoints verified successfully!');
  } catch (err: any) {
    console.error('Test failed:', err.message, err.response?.data || '');
    process.exit(1);
  }
}

testNestServer();
