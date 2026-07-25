import { Innertube, UniversalCache } from 'youtubei.js';

async function test() {
  try {
    const yt = await Innertube.create({
      client_name: 'ANDROID',
      cache: new UniversalCache(false),
      generate_session_locally: true,
      retrieve_player: true
    });

    const info = await yt.getInfo('cuMuMnCRfqk');
    const firstAudio = info.streaming_data.adaptive_formats.find(f => f.has_audio && !f.has_video);
    console.log("Raw Format Data keys:", Object.keys(firstAudio));
    console.log("Raw Format Data:", JSON.stringify(firstAudio, null, 2));

  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
