// aws reference: https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-generate-sdk-javascript.html

const apigClient = apigClientFactory.newClient();
var SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
const recognition = new SpeechRecognition();
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
			displayImage(res.data.results[0]);
			console.log(`Find ${res.data.results[0]}`);
		}
	}).catch((err) => {
		console.log(`Search failed: ${err}`)
	})
};

const handleAudio = async () => {
    console.log('handleAudio called');
	recognition.start();
	recognition.onresult = (event) => {
	  const speechToText = event.results[0][0].transcript;
	  console.log(speechToText);
	  $("#query-input").val(speechToText);
	  handleSearch();
	};
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

	$("#img").removeAttr("hidden");
	if (file) {
		img.src = URL.createObjectURL(file);
	}
};

const displayImage = async (filepath) => {
	const die = (msg) => {
		console.log(msg);
		alert(msg);
	};

	try {
		const res = await fetch(filepath);
		if (res.status != 200) {
			die(`Failed to fetch: status code ${res.status}`);
			return;
		}
		const buffer = await streamToArrayBuffer(res.body);
		const img_src = new TextDecoder().decode(buffer);
		
		$("#img").removeAttr("hidden");
		img.src = img_src;
	} catch (err) {
		die(`Failed to fetch and display image: ${err}`);
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
