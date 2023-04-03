// aws reference: https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-generate-sdk-javascript.html
// Transcribe: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-transcribe/
// const { TranscribeClient } = require("@aws-sdk/client-transcribe");
// const client = new TranscribeClient({ region: "us-east-1" });

const apigClient = apigClientFactory.newClient();
var SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
const recognition = new SpeechRecognition();
recognition.interimResults = true;
var recognition_clicked = false;	// prevent from querying multiple times
var file = null;


const handleSearch = async () => {
    console.log('handleSearch called');
    let label = $("#query-input").val();

    if (!label) {
		alert('Labels can not be empty!');
		return;
    }

	let params = {"q": label};
	let body = {};
    let additionalParams = {};

	apigClient.searchGet(params, body, additionalParams)
	.then((res) => {
		if (res.data.results == "No Result Found") {
			alert('No Such Photo Found!');
		} else {
			// remove duplicate
			unique_image_paths = [...new Set()];
			console.log(res.data.results[0], res.data.results[1]);
			console.log(`Find ${res.data.results[0]}`);

			displayImage(
				res.data.results[0],
				(res.data.results[0] != res.data.results[1]) ? res.data.results[1] : null
			);
		}
	}).catch((err) => {
		console.log(`Search failed: ${err}`)
	});
};

const handleAudio = async () => {
	recognition.onstart = () => {
		console.log("We are listening. Try speaking into the microphone.");
	};

	recognition.onresult = (event) => {
		recognition.stop();
		if (!recognition_clicked) return;
		recognition_clicked = false;
		const speechToText = event.results[0][0].transcript;
		console.log(speechToText);
		$("#query-input").val(speechToText);
		handleSearch();
	};

    console.log('handleAudio called');
	recognition_clicked = true;
	recognition.start();
};


const handleUpload = async (event) => {
	const toBase64 = (file) => new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.readAsDataURL(file);
		reader.onload = () => resolve(reader.result);
		reader.onerror = error => reject(error);
	});

	if (!file) {
		alert('No file selected!');
		return;
	}
	let labels = $("#label").val();
    labels = labels.split(/[ ,]+/);     // split by space or comma
	console.log(`uploaded labels ${labels}`)
	let params = {
		"object": file.name,
		"x-amz-meta-customLabels": labels
	};
	let body = await toBase64(file);
    let additionalParams = {};

	apigClient.uploadObjectPut(params, body, additionalParams)
	.then((res) => {
		console.log(res);
		if (res.status == 200) {
			alert(`Upload successfully!`);
		} else {
			alert(`Upload failed!`);
		}
	}).catch((err) => {
		console.log(`Upload failed: ${err}`);
	})
};

const previewFile = (event) => {
	console.log("onchange called");
	file = event.target.files[0];

	$("#img1").removeAttr("hidden");
	$("#img2").prop("hidden", true);
	if (file) {
		img1.src = URL.createObjectURL(file);
	}
};

const displayImage = async (filepath1, filepath2 = null) => {
	const die = (msg) => {
		console.log(msg);
		alert(msg);
	};

	$("#img2").prop("hidden", true);

	try {
		let res = await fetch(filepath1);
		if (res.status != 200) {
			die(`Failed to fetch: status code ${res.status}`);
		} else {
			let buffer = await streamToArrayBuffer(res.body);
			let img_src = new TextDecoder().decode(buffer);
			
			$("#img1").removeAttr("hidden");
			img1.src = img_src;
		}
	} catch (err) {
		die(`Failed to fetch and display image: ${err}`);
	}

	if (filepath2) {
		try {
			let res = await fetch(filepath2);
			if (res.status != 200) {
				die(`Failed to fetch: status code ${res.status}`);
			} else {
				let buffer = await streamToArrayBuffer(res.body);
				let img_src = new TextDecoder().decode(buffer);
				
				$("#img2").removeAttr("hidden");
				img2.src = img_src;
			}
		} catch (err) {
			die(`Failed to fetch and display image: ${err}`);
		}
	}
};


// helper function to retrieve from ReadableStream
// stream: ReadableStream<Uint8Array>, return type: Promise<Uint8Array>
async function streamToArrayBuffer(stream) {
    let result = new Uint8Array(0);
    const reader = stream.getReader();
    while (true) { // eslint-disable-line no-constant-condition
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        const newResult = new Uint8Array(result.length + value.length);
        newResult.set(result);
        newResult.set(value, result.length);
        result = newResult;
    }
    return result;
}
