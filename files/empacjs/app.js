// App for creating Custom Empac Modules
/** Built by Britton Lorentzen [brittonlorentzen@gmail.com, blorentz.com] */

// Loaders
import { EmpacLoader, EmpacComingSoon } from './modules.js';

// Data Driven Components
import { EmpacModule, EmpacContent } from './modules.js';

// Functions to make custom modules render
// Handlers for different elements
// Handle container
function handleContainer(theData) {
	let newElement;
	if (theData.tag != undefined) { newElement = document.createElement(theData.tag) }
	else { newElement = document.createElement('div') };
	if (theData.id != undefined) { newElement.id = theData.id; };

	// Handle inner elements
	if (theData.elements != undefined) {
		theData.elements.forEach((el) => {
			newElement.append(handleData(el));
		});
	};
	return newElement;
}

// Handle headline
function handleHeadline(theData) {
	let newElement;
	newElement = document.createElement(theData.tag);
	newElement.setAttribute('size', theData.size);
	newElement.innerHTML = theData.content;
	return newElement;
}

// Handle text
function handleText(theData) {
	let newElement;
	newElement = document.createElement(theData.tag);
	newElement.innerHTML = theData.content;
	if (theData.size != undefined) { newElement.setAttribute('size', theData.size) };
	return newElement;
}

// Handle image
function handleImage(theData) {
	let newElement;
	newElement = document.createElement('img');
	newElement.setAttribute('alt', theData.alt);
	newElement.setAttribute('size', theData.size);
	newElement.src = theData.src;
	return newElement;
}

// Handle link
function handleLink(theData) {
	let newElement;
	newElement = document.createElement('a');
	if (theData.target != undefined) { newElement.setAttribute('target', theData.target); };
	if (theData.href != undefined) { newElement.setAttribute('href', theData.href); };
	if (theData.tabindex != undefined) { newElement.setAttribute('tabindex', theData.tabindex); };

	// If link has subtype, set it up accordingly
	if (theData.subtype != undefined) {
		if (theData.subtype == 'social') {
			// Add social image to button
			let socialButton = document.createElement('img');
			socialButton.classList.add('social');
			socialButton.src = '/files/empacjs/images/social/' + theData.color + '/' + theData.network + '.svg';
			newElement.append(socialButton);

			// Add remaining styling/attributes
			newElement.setAttribute('aria-label', theData.network);
		} else if (theData.subtype == 'image') {
			let img = document.createElement('img');
			img.setAttribute('alt', theData.aria_label);
			img.src = theData.src;
			newElement.append(img);
		}
	}
	else {
		newElement.setAttribute('aria-label', theData.aria_label);
		newElement.innerHTML = theData.content;
	};
	return newElement;
}

// Handle button
function handleButton(theData) {
	let newElement;
	if (theData.subtype != undefined) {
		if (theData.subtype == 'navToggle') {
			newElement = document.createElement('div');
			newElement.classList.add('toggle');
			newElement.append(document.createElement('span'));
			newElement.append(document.createElement('span'));
			newElement.setAttribute('tabindex', 0);
		}

		if (theData.subtype == 'image') {
			newElement = document.createElement('button');
			let newImg = document.createElement('img');
			newImg.setAttribute('size', theData.size);
			newImg.setAttribute('alt', theData.alt_text);
			newImg.setAttribute('src', theData.src);
			newElement.append(newImg);
		}

		if (theData.subtype == 'carousel-paddle') {
			newElement = document.createElement('button');
			if (theData.scrollDir == 'left') { newElement.innerHTML = '&lsaquo;' }
			else if (theData.scrollDir == 'right') { newElement.innerHTML = '&rsaquo;' };
			newElement.setAttribute('scroll-direction', theData.scrollDir);
		}
	}
	else {
		newElement = document.createElement('button');
		newElement.innerHTML = theData.content;
		newElement.setAttribute('aria-label', theData.aria_label);
	}
	return newElement;
}

// Handle video
function handleVideo(theData) {
	let newElement;
	if (theData.subtype == 'youtube') {
		newElement = document.createElement('iframe');
		newElement.src = 'https://youtube.com/embed/' + theData.video_id;
		newElement.setAttribute('title', theData.title);
	} else if (theData.subtype == 'standard') {
		newElement = document.createElement('video');
		newElement.setAttribute('poster', theData.poster);
		let vidSource = document.createElement('source');
		vidSource.setAttribute('src', theData.video_id);
		vidSource.setAttribute('type', 'video/mp4');
		newElement.append(vidSource);
	};
	return newElement;
}

// Create elements based on data input
function createElement(theData) {
	let newElement;
	if (theData.type == 'container') { newElement = handleContainer(theData); };
	if (theData.type == 'headline') { newElement = handleHeadline(theData); };
	if (theData.type == 'text') { newElement = handleText(theData); };
	if (theData.type == 'image') { newElement = handleImage(theData); };
	if (theData.type == 'link') { newElement = handleLink(theData); };
	if (theData.type == 'button') { newElement = handleButton(theData); };
	if (theData.type == 'video') { newElement = handleVideo(theData); };
	return newElement;
}

/** Function that gets data from the server */
export async function getData(theData, theType, theSubType, theDir) {
	let url = '/files/empacjs/json/';
	// Point to proper content type
	if (theType != undefined) {
		url += theType; url += '/';
	}
	else { url += 'modules/'; };
	// Append sub directory
	if (theDir != undefined) { url += theDir; url += '/'; };
	url += theData;
	url += '.json';
	let request = new Request(url);
	let response = await fetch(request);
	if (theSubType == undefined || theSubType == null) { return await response.json(); }
	else if (theSubType != undefined) { return await response.json()[theSubType]; };
}

/** Function that gets data from the server */
export async function getComments(theData) {
	let url = '/files/empacjs/json/articles/';
	// Point to proper content type
	url += theData;
	url += '.json';
	let request = new Request(url);
	let response = await fetch(request);
	return await response.json();
}

/** Function that handles data driven components */
export function handleData(theData) {
	// Create new element
	let newElement;

	if (theData.type != "snippet") { newElement = createElement(theData); };

	if (theData.type == "snippet") {
		newElement = document.createElement('ejs-content');
		newElement.setAttribute('data', theData.data);
		newElement.setAttribute('data-type', 'content');
		newElement.setAttribute('data-subtype', theData.subtype);
		if (theData.dir != undefined) { newElement.setAttribute('data-dir', theData.dir) };
	};

	// Handle attributes
	if (theData.attributes != undefined) {
		theData.attributes.forEach((attr) => {
			if (attr.key != undefined) {
				newElement.setAttribute(attr.key, attr.value);
			}
			else { newElement.setAttribute(attr, true); };
		});
	};

	// Handle classes
	if (theData.classList != undefined) {
		theData.classList.forEach((newClass) => {
			newElement.classList.add(newClass);
		});
	};

	// Handle properties
	if (theData.properties != undefined) {
		theData.properties.forEach((prop) => {
			newElement.style.setProperty(prop.key, prop.value);
		});
	};

	// Set the element with type
	newElement.setAttribute('ejs-type', theData.type);

	// Return new element
	return newElement;
}

/** Define custom components **/
window.customElements.define('ejs-coming', EmpacComingSoon);
window.customElements.define('ejs-module', EmpacModule);
window.customElements.define('ejs-content', EmpacContent);
