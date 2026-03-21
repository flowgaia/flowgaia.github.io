import { readFileSync, writeFileSync } from 'fs';
import { load } from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const config = load(readFileSync(join(root, 'config.yaml'), 'utf8'));
const tracks = [];
const albums = [];

for (const album of config.albums) {
  const track_ids = [];
  album.songs.forEach((song, idx) => {
    const title = song.subtitle ? `${song.title} (${song.subtitle})` : song.title;
    tracks.push({
      id: song.id,
      title,
      artist: song.artist || album.artist,
      album: album.title,
      duration: 0,
      track_number: idx + 1,
      uri: song.audio,
      artwork_url: song.image || album.cover || '',
    });
    track_ids.push(song.id);
  });
  albums.push({
    id: album.id,
    name: album.title,
    artist: album.artist,
    artwork_url: album.cover || '',
    track_ids,
  });
}

writeFileSync(join(root, 'music.json'), JSON.stringify({ tracks, albums }, null, 2));
console.log(`Generated music.json: ${tracks.length} tracks, ${albums.length} albums`);
