prompt.txt


1) keep 3 background modes.
1b) kawarp with album art center (need to add)
1a) kawarp no album art at center (current, refer exsiting implementation)
1c) no kawarp just old full cover art as background. no square coverart  (current, refer exsiting implementation)


2) press and hold pause button should toggle betwwen the 3 modes


3) i dont think you understand. when i click a song from the search results, just for that song the artwork should be high resolution. it should automatically refetch "https://yt3.googleusercontent.com/FQsPsZdaGUkT3_Q-9iilsYnS6xc0CAerb6pIhUou-skal6-jMQQ-xUigopbvfqVP_e-msHiabmCN2wCl=w1800-h1800"  NOTE: no wsrv.nl  just "https://yt3.googleusercontent.com/FQsPsZdaGUkT3_Q-9iilsYnS6xc0CAerb6pIhUou-skal6-jMQQ-xUigopbvfqVP_e-msHiabmCN2wCl=w1800-h1800" w1800-h1800 is important which is high resolution needed for artwork. if needed create new function for this. for all other thumbnails it will be wsrv.nl 180 res thumbnails. just for


4) that id is not the same for "yt3.googleusercontent.com" do a research how to get the id

5) i dont know what changes you did but now the kawarp broke. use the w180 image for kawarp and on toggling the modes why is it making multiple get calls to the yt3 url? cache the image

6) add a container above
 <MediaDetails />
 and
 backdrop-filter: blur(10px); for the entire container and all elements inside it


 7) [plugin:vite:import-analysis] Failed to resolve entry for package "@uimaxbai/am-lyrics". The package may have incorrect main/module/exports specified in its package.json.

D:/gitRepo/New folder (12)/ytify/src/features/Player/Lyrics.tsx:3:7

6  |  import { onCleanup } from "solid-js";
7  |  import { playerStore } from "@stores";
8  |  import "@uimaxbai/am-lyrics";
   |          ^