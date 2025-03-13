import express from "express"; //web framework, handles HTTP requests
import axios from "axios"; //makes HTTP requests
import dotenv from "dotenv"; //load info from .env
import open from "open"; //open page in browser
import querystring from "querystring"; //encodes params into url query string
import session, { Cookie } from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import SpotifyWebApi from "spotify-web-api-node";
import say from "say";

//define __dirname manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config(); //load env variables
const app = express(); //init express
const port = 3000; //set port

//init ejs for variable display in html
app.set("view engine", "ejs");

//static files
app.use(express.static(path.join(__dirname, 'public')));

//middleware to parse json bodies
app.use(express.json());
//middleware to parse url encoded bodies
app.use(express.urlencoded({ extended: true }));

//session init
const APP_SECRET = process.env.APP_SECRET;
app.use(
    session({
        secret: APP_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false } //set to false when testing locally, true when using HTTPS
    })
);

//api constants
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/callback";
const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_ME_URL = "https://api.spotify.com/v1/me"; //endpoint to get user info

//set up SAPI credentials
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: REDIRECT_URI
})

//redirect user to home page
app.get("/", (req, res) => {
    res.sendFile(__dirname + '/views/index.html')
});

app.get("/login", (req, res) => {
    const scope = "user-modify-playback-state user-read-playback-state playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative user-library-read user-library-modify user-top-read"; //permissions
    const authUrl = `${SPOTIFY_AUTH_URL}?${querystring.stringify({ //building login url
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: scope,
        show_dialog: true
    })}`;
    res.redirect(authUrl); //redirect to login url that was just built
});

//handle Spotify's callback and request access token
app.get("/callback", async (req, res) => { //define route, define that the function handling the http request is asynchronous
    const code = req.query.code || null; //extract auth code from the url of the request made by the user when they log in

    try {
        const data = await spotifyApi.authorizationCodeGrant(code);
        const accessToken = data.body['access_token'];
        const refreshToken = data.body['refresh_token'];

        //set tokens in Spotify API
        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);

        //store access token in session
        req.session.accessToken = accessToken;
        req.session.refreshToken = refreshToken;
        
        //redirect user to profile route
        res.redirect("/profile");
    } catch (error) {
        res.send("Error retrieving access token"); //error handling
    }
});

//refresh token function, used for when access tokens expire
async function refreshToken(req) {
    try {
        spotifyApi.setRefreshToken(req.session.refreshToken);
        const data = await spotifyApi.refreshAccessToken();
        const newAccessToken = data.body['access_token'];

        //refresh token with new one
        spotifyApi.setAccessToken(newAccessToken);
        //store in session
        req.session.accessToken = newAccessToken;
    } catch (error) {
        console.error('Error refreshing token: ', error);
        throw new Error('Failed to refresh token');
    }
}

//fetch user profile using token in session
app.get("/profile", async (req, res) => { //define route, define that the function handling the http request is asynchronous
    const accessToken = req.session.accessToken; //variable holding token
    if (!accessToken) return res.redirect("/login"); //if token doesn't exist, user must reauthenticate

    try {
        const response = await axios.get(SPOTIFY_ME_URL, { //wait for spotify response containing user info via /me endpoint
            headers: { Authorization: `Bearer ${accessToken}` } //pass token to spotify
        });

        const username = response.data.display_name || "Unknown User"; //variable holding username, if no username "unknown user" is displayed
        const topArtists = await spotifyApi.getMyTopArtists();
        const artistArray = [];

        //add top artists to array
        topArtists.body.items.slice(0,10).forEach((artist) => {
            artistArray.push({
                name: artist.name
            })
        })

        //artist array debugging
        console.log(artistArray);

        res.render("profile", { username, artistArray });
    } catch (error) {
        res.send("Error fetching user profile"); //error handling
    }
});

//helper route for play, get playback state
app.get('/playback-state', async (req, res) => {
    try {
        const state = await spotifyApi.getMyCurrentPlaybackState();
        res.json(state.body);
    } catch (error) {
        if (error.statusCode === 401){ //if token is expired, attempt to refresh
            try {
                console.log('Token expired, attempting to refresh');
                await refreshToken(req);
                const state = await spotifyApi.getMyCurrentPlaybackState(); //try api call after refresh
                res.json(state.body);
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and get playback state')
            }
        } else {
            console.error('Error fetching playback state:', error);
            res.status(500).send('Failed to get playback state');
        }
    }
});

//get currently playing track
app.get('/currently-playing', async (req, res) => {
    try {
        const response = await spotifyApi.getMyCurrentPlayingTrack();

        //log the response to inspect the structure of the data
        console.log('Currently playing track response:', response.body);

        //check if there is no track playing
        if (!response.body || !response.body.item) {
            return res.status(200).json({ message: 'No track is currently playing' });
        }

        const track = response.body.item;
        const trackId = track.id;

        //send track id to client
        res.json({ trackId });
    } catch (error) {
        if (error.statusCode === 401){
            try {
                console.log('Token expired, attempting to refresh');
                await refreshToken(req); //attempt refresh

                //retry after refresh
                const response = await spotifyApi.getMyCurrentPlayingTrack();
                console.log('Token Refreshed! Currently playing track response:', response.body);
                if (!response.body || !response.body.item){
                    return res.status(200).json({ message: 'No track is currently playing'});
                }
                const track = response.body.item;
                const trackId = track.id;
                res.json({ trackId });

            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                return res.status(500).send('Failed to refresh token and get current track');
            }
        } else {
            console.error('Error fetching current track:', error);
            res.status(500).send('Failed to get current track');
        }
    }
});

//command routes
app.post('/next-track', async (req, res) => {
    try {
        //SAPI call, skip to next track
        await spotifyApi.skipToNext();
        res.status(200).send('Skipped to next track');
    } catch (error) {
        if (error.statusCode === 401){
            try {
                console.log('Token expired, attempting to refresh');
                await refreshToken(req);

                //retry
                await spotifyApi.skipToNext();
                res.status(200).send('Token refreshed! Skipped to next track');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                return res.status(500).send('Failed to refresh token and skip to next track');
            }
        } else {
            console.error('Error skipping to next track', error);
            res.status(500).send('Failed to skip');
        }
    }
});

app.post('/previous-track', async (req, res) => {
    try {
        await spotifyApi.skipToPrevious();
        res.status(200).send('Skipped to previous track');
    } catch (error) {
        if (error.statusCode === 401){
            try {
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                await spotifyApi.skipToPrevious();
                res.status(200).send('Token refreshed! Skipped to previous track');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed refresh token and skip to previous track');
            }
        } else {
            console.error('Error skipping to previous track', error);
            res.status(500).send('Failed to skip');
        }
    }
});

app.post('/pause', async (req, res) => {
    try {
        await spotifyApi.pause();
        res.status(200).send('Paused playback');
    } catch (error) {
        if (error.statusCode === 401){
            try {
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                await spotifyApi.pause();
                res.status(200).send('Token refreshed! Paused playback');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and pause playback');
            }
        } else {
            console.error('Error pausing playback', error);
            res.status(500).send('Failed to pause');
        }
    }
});

app.post('/play', async (req, res) => {
    try {
        await spotifyApi.play();
        res.status(200).send('Started playback');
    } catch (error) {
        if (error.statusCode === 401){
            try {
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                await spotifyApi.play();
                res.status(200).send('Token refreshed! Started playback');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and resume playback');
            }
        } else {
            console.error('Error starting playback', error);
            res.status(500).send('Failed to play');
        }
    }
});

app.post('/save', async (req, res) => {
    try {
        const { trackId } = req.body; //get track ID from request body
        
        //error handling if trackId is not provided
        if (!trackId) {
            return res.status(400).json({ error: 'Track id is required' });
        }

        //check if the song is already in the library
        const response = await spotifyApi.containsMySavedTracks([trackId]);

        //ensure the response is valid and check if the track is already in the library
        if (response.body && response.body.length > 0 && !response.body[0]) {
            //track is not saved, add it
            await spotifyApi.addToMySavedTracks([trackId]);
            console.log(`Track with ID: ${trackId} has been added to your library.`);
            say.speak('Track saved to liked songs');
            return res.status(200).json({ message: 'Track added to library' });
        } else if (response.body && response.body.length > 0 && response.body[0]) {
            //track is already saved
            console.log(`Track with ID: ${trackId} is already in your library.`);
            say.speak('Track is already saved to liked songs');
            return res.status(200).json({ message: 'Track is already in your library' });
        } else {
            console.error('Unexpected response from containsMySavedTracks:', response.body);
            return res.status(500).json({ error: 'Failed to check track status' });
        }
    } catch (error) {
        if (error.statusCode === 401){
            try {
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                const response = await spotifyApi.containsMySavedTracks([trackId]);
        
                if (response.body && response.body.length > 0 && !response.body[0]) {
                    await spotifyApi.addToMySavedTracks([trackId]);
                    console.log(`Track with ID: ${trackId} has been added to your library.`);
                    say.speak('Track saved to liked songs');
                    return res.status(200).json({ message: 'Token refreshed! Track added to library' });
                } else if (response.body && response.body.length > 0 && response.body[0]) {
                    //track is already saved
                    console.log(`Track with ID: ${trackId} is already in your library.`);
                    say.speak('Track is already saved to liked songs');
                    return res.status(200).json({ message: 'Track is already in your library' });
                } else {
                    console.error('Unexpected response from containsMySavedTracks:', response.body);
                    return res.status(500).json({ error: 'Failed to check track status' });
                }
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and save track to library');
            }
        } else {
            console.error('Error saving track:', error);
            res.status(500).send('Failed to save track');            
        }
    }
});

app.post('/remove', async (req, res) => {
    try {
        const { trackId } = req.body; //get track ID from request body
        
        //error handling if trackId is not provided
        if (!trackId) {
            return res.status(400).json({ error: 'Track id is required' });
        }

        //check if the song is already in the library
        const response = await spotifyApi.containsMySavedTracks([trackId]);

        //ensure the response is valid and check if the track is already in the library
        if (response.body && response.body.length > 0 && !response.body[0]) {
            //track is not saved, disregard
            console.log(`Track with ID: ${trackId} is not in your library.`);
            say.speak('Track is not in liked songs');
            return res.status(200).json({ message: 'Track not in library' });
        } else if (response.body && response.body.length > 0 && response.body[0]) {
            //track is saved, remove it
            await spotifyApi.removeFromMySavedTracks([trackId]);
            console.log(`Track with ID: ${trackId} removed from library.`);
            say.speak('Track removed from liked songs');
            return res.status(200).json({ message: 'Track removed from library' });
        } else {
            console.error('Unexpected response from containsMySavedTracks:', response.body);
            return res.status(500).json({ error: 'Failed to check track status' });
        }
    } catch (error) {
        if (error.statusCode === 401){
            try{
                console.log('Token expired, attempting to refresh');
                await refreshToken();
    
                //retry
                const response = await spotifyApi.containsMySavedTracks([trackId]);
    
                if (response.body && response.body.length > 0 && !response.body[0]) {
                    console.log(`Track with ID: ${trackId} is not in your library.`);
                    say.speak('Track is not in liked songs');
                    return res.status(200).json({ message: 'Track not in library' });
                } else if (response.body && response.body.length > 0 && response.body[0]) {
                    await spotifyApi.removeFromMySavedTracks([trackId]);
                    console.log(`Track with ID: ${trackId} removed from library.`);
                    say.speak('Track removed from liked songs');
                    return res.status(200).json({ message: 'Token refreshed! Track removed from library' });
                } else {
                    console.error('Unexpected response from containsMySavedTracks:', response.body);
                    return res.status(500).json({ error: 'Failed to check track status' });
                }
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and remove track from library');
            }
        } else {
            console.error('Error removing', error);
            res.status(500).send('Failed to remove track');            
        }
    }
});

app.post('/volume-25', async (req, res) => {
    try {
        await spotifyApi.setVolume(25);
        res.status(200).send('Set volume to 25');
    } catch (error) {
        if (error.statusCode === 401) {
            try{
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                await spotifyApi.setVolume(25);
                res.status(200).send('Token refreshed! Set volume to 25');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and set volume');
            }
        } else {
            console.error('Error setting volume', error);
            res.status(500).send('Failed to set volume');
        }
    }
});

app.post('/volume-50', async (req, res) => {
    try {
        await spotifyApi.setVolume(50);
        res.status(200).send('Set volume to 50');
    } catch (error) {
        if (error.statusCode === 401) {
            try{
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                await spotifyApi.setVolume(50);
                res.status(200).send('Token refreshed! Set volume to 50');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and set volume');
            }
        } else {
            console.error('Error setting volume', error);
            res.status(500).send('Failed to set volume');
        }
    }
});

app.post('/volume-75', async (req, res) => {
    try {
        await spotifyApi.setVolume(75);
        res.status(200).send('Set volume to 75');
    } catch (error) {
        if (error.statusCode === 401) {
            try{
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                await spotifyApi.setVolume(75);
                res.status(200).send('Token refreshed! Set volume to 75');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and set volume');
            }
        } else {
            console.error('Error setting volume', error);
            res.status(500).send('Failed to set volume');
        }
    }
});

app.post('/volume-max', async (req, res) => {
    try {
        await spotifyApi.setVolume(100);
        res.status(200).send('Set volume to 100');
    } catch (error) {
        if (error.statusCode === 401) {
            try{
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                await spotifyApi.setVolume(100);
                res.status(200).send('Token refreshed! Set volume to 100');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and set volume');
            }
        } else {
            console.error('Error setting volume', error);
            res.status(500).send('Failed to set volume');
        }
    }
});

app.post('/mute', async (req, res) => {
    try {
        await spotifyApi.setVolume(0);
        res.status(200).send('Set volume to 0');
    } catch (error) {
        if (error.statusCode === 401) {
            try{
                console.log('Token expired, attempting to refresh');
                await refreshToken();

                //retry
                await spotifyApi.setVolume(0);
                res.status(200).send('Token refreshed! Set volume to 0');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and set volume');
            }
        } else {
            console.error('Error setting volume', error);
            res.status(500).send('Failed to set volume');
        }
    }
});

app.post('/shuffle', async (req, res) => {
    try {
        await spotifyApi.setShuffle(true);
        say.speak("Shuffle enabled");
        res.status(200).send('Shuffle enabled');
    } catch (error) {
        if (error.statusCode === 401) {
            try{
                console.log('Token expired, attempting to refresh');
                await refreshToken();
    
                //retry
                await spotifyApi.setShuffle(true);
                say.speak("Shuffle enabled");
                res.status(200).send('Shuffle enabled');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and enable shuffle');
            }
        }  else {
            console.error('Error enabling shuffle', error);
            res.status(500).send('Failed to enable shuffle');
        }
    }
});

app.post('/order', async (req, res) => {
    try {
        await spotifyApi.setShuffle(false);
        say.speak("Shuffle disabled");
        res.status(200).send('Shuffle disabled');
    } catch (error) {
        if (error.statusCode === 401) {
            try{
                console.log('Token expired, attempting to refresh');
                await refreshToken();
    
                //retry
                await spotifyApi.setShuffle(false);
                say.speak("Shuffle disabled");
                res.status(200).send('Shuffle disabled');
            } catch (refreshError) {
                console.error('Failed to refresh token: ', refreshError);
                res.status(500).send('Failed to refresh token and disable shuffle');
            }
        }  else {
            console.error('Error disabling shuffle', error);
            res.status(500).send('Failed to disable shuffle');
        }
    }
});

//start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    open("http://localhost:3000"); //open in browser immediately
});