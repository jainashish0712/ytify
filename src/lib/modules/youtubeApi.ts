interface YouTubeSearchThumbnail {
  url: string;
  width?: number;
  height?: number;
}

interface YouTubeSearchResultItem {
  id?: {
    kind?: string;
    videoId?: string;
  };
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    title?: string;
    description?: string;
    channelTitle?: string;
    thumbnails?: {
      default?: YouTubeSearchThumbnail;
      medium?: YouTubeSearchThumbnail;
      high?: YouTubeSearchThumbnail;
    };
  };
}

interface YouTubeSearchListResponse {
  items?: YouTubeSearchResultItem[];
  error?: {
    code?: number;
    message?: string;
  };
}

export async function searchYouTubeDataApi(query: string, apiKey: string): Promise<YTItem[]> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=25&type=video&q=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    const errorData: YouTubeSearchListResponse = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `YouTube API request failed with status ${res.status}`);
  }

  const data: YouTubeSearchListResponse = await res.json();
  const items = data.items || [];

  return items
    .filter((item): item is YouTubeSearchResultItem & { id: { videoId: string } } =>
      Boolean(item.id?.videoId && item.id.videoId.length === 11)
    )
    .map((item): YTItem => {
      const videoId = item.id.videoId;
      const snippet = item.snippet;
      const title = snippet?.title || 'Unknown';
      const author = snippet?.channelTitle || 'Unknown';
      const authorId = snippet?.channelId || '';
      const imgUrl = snippet?.thumbnails?.high?.url || snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url || '';

      return {
        id: videoId,
        title,
        author,
        authorId,
        duration: '00:00',
        subtext: author,
        img: imgUrl,
        type: 'song'
      };
    });
}
