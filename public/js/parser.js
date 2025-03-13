
//track whether listening is on or off
let isListening = false;

//SpeechRecognition api instance
let recognition;

//function to scroll to the bottom of the .output container
function scrollToBottom() {
    const output = document.querySelector('.output');
    output.scrollTop = output.scrollHeight;
}

//toggles listening functionality when buttons are pressed
function toggleRecognition() {
    if (!isListening) {
        startRecognition();
    } else {
        stopRecognition();
    }
}

//starts speech recognition process
function startRecognition() {
    //check if api is available
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    //alert if api is not available/not supported by browser
    if (!window.SpeechRecognition) {
        alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
        return;
    }

    //create new SRAPI instance
    recognition = new SpeechRecognition();

    //only process finalized words
    recognition.interimResults = false;

    //listen continuously until stopped
    recognition.continuous = true;

    //set language
    recognition.lang = "en-US";

    //select where recognized words will be shown
    const outputDiv = document.querySelector(".output");

    //listen for SRAPI instance results
    //e is the event that contains the instance results
    recognition.addEventListener("result", (e) => {
        //fetch most recent recognized word
        const word = e.results[e.results.length - 1][0].transcript.trim().toLowerCase();
        //e.results = all recognized words up to that point
        //[0] = most confident interpretation of what was said
        //.transcript = extracts text
        //.trim() = removes whitespace

        //create p element for extracted word
        let p = document.createElement("p");

        //place recognized word inside p element
        if (cmdList.includes(word)) {
            p.innerText = word;
        } else {
            p.innerText = "Command not recognized: " + word;
        }

        //add p element to webpage
        outputDiv.appendChild(p);
        console.log(word);
        scrollToBottom();

        //check if word matches known command
        processCommand(word);
    });

    //event listener for when speech recognition stops on its own (inactivity, system event, etc.)
    recognition.addEventListener("end", () => {
        // only restart if we were listening and recognition was stopped due to inactivity
        if (isListening) {
            setTimeout(() => {
                recognition.start();  // Restart recognition with a small delay
            }, 300); // Add a small delay (300ms) to allow proper reset
        }
    });

    //start speech recognition, update boolean to match
    recognition.start();
    isListening = true;

    //update button text to indicate speech recognition is active
    document.getElementById("toggleBtn").innerText = "Stop Listening";

    //print to terminal
    console.log("listening started");
}

//stop speech recognition
function stopRecognition() {
    //stop active SRAPI session
    if (recognition) {
        recognition.stop();
    }

    //reset boolean
    isListening = false;

    //update button to indicate speech recognition is not active
    document.getElementById("toggleBtn").innerText = "Start Listening";

    //print to terminal
    console.log("listening stopped");
}

let lastCommandTime = 0;
const commandCooldown = 500; //time in ms

//list of commands
const cmdList = ['skip to next', 'go back', 'pause', 'play', 'volume 25', 'volume 50', 'volume 75', 'volume max', 'mute', 'save', 'remove', 'shuffle', 'order']
function processCommand(word) {
    const currentTime = Date.now();
    if (currentTime - lastCommandTime < commandCooldown) {
        return; //ignore if commands are said too soon
    }
    lastCommandTime = currentTime;

    switch (word) {
        case "skip to next":
            console.log("skipping to next");
            skipToNextTrack();
            break;
        case "go back":
            console.log("skipping to previous track");
            skipToPrevTrack();
            break;
        case "pause":
            console.log("pausing");
            pause();
            break;
        case "play":
            console.log("resuming playback");
            play();
            break;
        case "volume 25":
            console.log("setting volume");
            volume25();
            break;
        case "volume 50":
            console.log("setting volume");
            volume50();
            break;
        case "volume 75":
            console.log("setting volume");
            volume75();
            break;
        case "volume max":
            console.log("setting volume");
            volumeMax();
            break;
        case "mute":
            console.log("setting volume");
            mute();
            break;
        case "save":
            console.log("saving track");
            save();
            break;
        case "remove":
            console.log("removing track");
            remove();
            break;
        case "shuffle":
            console.log("enabling shuffle");
            shuffle();
            break;
        case "order":
            console.log("disabling shuffle");
            order();
            break;
        //error handling
        default:
            console.log("Command not recognized: " + word);
    }
}

//SAPI calls
async function skipToNextTrack() {
    try {
        const response = await fetch('/next-track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Skipped to next track');
        } else {
            console.error('Failed to skip track');
        }
    } catch (error) {
        console.error('Error calling skipToNextTrack:', error);
    }
}

async function skipToPrevTrack() {
    try {
        const response = await fetch('/previous-track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Skipped to previous track');
        } else {
            console.error('Failed to skip track');
        }
    } catch (error) {
        console.error('Error calling skipToPrevTrack:', error);
    }
}

async function pause() {
    try {
        //check current playback state
        const stateResponse = await fetch('/playback-state', {
            method: 'GET'
        });

        if (stateResponse.ok) {
            const state = await stateResponse.json();

            //if playback is already paused, log and return
            if (!state.is_playing) {
                console.log('Playback already paused');
                return; // No need to make the /pause request
            }

            //send pause request if playback is currently playing
            const response = await fetch('/pause', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log('Paused playback');
            } else {
                console.error('Failed to pause');
            }
        } else {
            console.error('Failed to get playback state');
        }
    } catch (error) {
        console.error('Error calling pause:', error);
    }
}

async function play() {
    try {
        //check current playback state
        const stateResponse = await fetch('/playback-state', {
            method: 'GET'
        });

        if (stateResponse.ok) {
            const state = await stateResponse.json();

            //if already playing, avoid trying to start playback again
            if (state.is_playing) {
                console.log('Playback already in progress');
                return;
            }
        }

        //start playback if not already playing
        const response = await fetch('/play', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Started playback');
        } else {
            console.error('Failed to start playback');
        }
    } catch (error) {
        console.error('Error calling play:', error);
    }
}

async function volume25() {
    try {
        const response = await fetch('/volume-25', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Set volume to 25');
        } else {
            console.error('Failed to set volume');
        }
    } catch (error) {
        console.error('Error calling volume25:', error);
    }
}

async function volume50() {
    try {
        const response = await fetch('/volume-50', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Set volume to 50');
        } else {
            console.error('Failed to set volume');
        }
    } catch (error) {
        console.error('Error calling volume50:', error);
    }
}

async function volume75() {
    try {
        const response = await fetch('/volume-75', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Set volume to 75');
        } else {
            console.error('Failed to set volume');
        }
    } catch (error) {
        console.error('Error calling volume75:', error);
    }
}

async function volumeMax() {
    try {
        const response = await fetch('/volume-max', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Set volume to 100');
        } else {
            console.error('Failed to set volume');
        }
    } catch (error) {
        console.error('Error calling volumeMax:', error);
    }
}

async function mute() {
    try {
        const response = await fetch('/mute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Set volume to 0');
        } else {
            console.error('Failed to set volume');
        }
    } catch (error) {
        console.error('Error calling mute:', error);
    }
}

async function save() {
    try {
        //fetch the currently playing track from the server.js
        const response = await fetch('/currently-playing');
        const data = await response.json();  //parse the JSON response

        if (response.ok && data.trackId) {
            //pass trackId to the save function
            const trackId = data.trackId;
            console.log('Track ID:', trackId); //log trackId to make sure it's fetched correctly
            
            const saveResponse = await fetch('/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ trackId })
            });

            if (saveResponse.ok) {
                console.log('Track saved');
            } else {
                console.error('Failed to save track');
            }
        } else {
            console.log('No track currently playing');
        }
    } catch (error) {
        console.error('Error calling save:', error);
    }
}

async function remove() {
    try {
        const response = await fetch('/currently-playing');
        const data = await response.json();

        if (response.ok && data.trackId) {
            const trackId = data.trackId;
            console.log('Track ID:', trackId);
            
            const saveResponse = await fetch('/remove', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ trackId })
            });

            if (saveResponse.ok) {
                console.log('Track removed');
            } else {
                console.error('Failed to remove track');
            }
        } else {
            console.log('No track currently playing');
        }
    } catch (error) {
        console.error('Error calling save:', error);
    }
}

async function shuffle() {
    try {
        const response = await fetch('/shuffle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Enabled shuffle');
        } else {
            console.error('Failed to enable shuffle');
        }
    } catch (error) {
        console.error('Error calling shuffle:', error);
    }
}

async function order() {
    try {
        const response = await fetch('/order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log('Disabled shuffle');
        } else {
            console.error('Failed to disable shuffle');
        }
    } catch (error) {
        console.error('Error calling order:', error);
    }
}

//attach event listener to button to toggle recognition when clicked
document.getElementById("toggleBtn").addEventListener("click", toggleRecognition);