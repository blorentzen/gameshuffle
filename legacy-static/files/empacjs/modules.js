// Custom components for EmpacJS
/** Built by Britton Lorentzen [brittonlorentzen@gmail.com, blorentz.com] */

/** Import Methods **/
import { getData, handleData } from './app.js';

// Class for generating an Empac Loader
export class EmpacLoader extends HTMLElement {
	constructor() {
		super();
	}
	connectedCallback() {

		// Set up primary container
		let container = document.createElement('div');
		container.classList.add('primary-loader');
		container.appendChild(document.createElement('span'));

		let img = document.createElement('img');
		img.setAttribute('alt', 'game shuffle');
		img.setAttribute('size', 'medium');
		img.src = '/files/images/fg/logos/gs-color-mono.png';

		container.appendChild(img);

		this.appendChild(container);

	}
}

// Class for generating an Empac Coming Soon page
export class EmpacComingSoon extends HTMLElement {
	constructor() {
		super();
	}
	connectedCallback() {

		// Set up primary container
		let primary = document.createElement('div');
		primary.classList = 'coming-soon dark-mode';

		// Set up content section
		let content = document.createElement('div');
		content.classList = 'main-section';

		// Set up loader
		let loader = document.createElement('div');
		loader.classList = "loader";
		loader.setAttribute('custom-margin', true);

		loader.appendChild(document.createElement('span'));

		let emblem = document.createElement('img');
		emblem.setAttribute('alt', 'empac');
		emblem.setAttribute('size', 'small');
		emblem.src = '/files/images/icons/company/white/empac-emblem.svg';

		loader.appendChild(emblem);
		content.appendChild(loader);

		/** **/
		let headline = document.createElement('h1');
		headline.setAttribute('size', 'small');
		headline.innerText = 'Page is coming soon.';

		content.appendChild(headline);

		/** **/
		let subhead = document.createElement('p');
		subhead.innerText = "We're currently working on some big changes. In the meantime, check us out on our social channels.";

		content.appendChild(subhead);

		/** **/
		let socialbar = document.createElement('div');
		socialbar.classList = 'row';
		socialbar.setAttribute('custom-margin', true);

		let socialList = [
			{ platform: "facebook", href: "https://www.facebook.com/EmeraldPacific" },
			{ platform: "twitter", href: "https://www.twitter.com/EmeraldPacific" },
			{ platform: "instagram", href: "https://www.instagram.com/emeraldpacific" },
			{ platform: "linkedin", href: "https://www.linkedin.com/company/EmeraldPacific" },
		];

		socialList.forEach(el => {
			let newLink = document.createElement('a');
			newLink.setAttribute('target', '_blank');
			newLink.setAttribute('href', el.href);

			/** **/
			let newImg = document.createElement('img');
			newImg.setAttribute('alt', el.platform);
			newImg.classList = 'social';
			newImg.setAttribute('src', '/files/empacjs/images/social/white/' + el.platform + '.svg');
			newLink.appendChild(newImg);

			socialbar.appendChild(newLink);
		});

		content.appendChild(socialbar);
		primary.appendChild(content);

		this.appendChild(primary);

	}
}

// Class for generating a primary content module 
export class EmpacModule extends HTMLElement {
	constructor() {
		super();
	}
	connectedCallback() {
		// Set component based on data
		let newData;

		if (this.getAttribute('data') != undefined) {
			let dataString = this.getAttribute('data');
			let dataType = this.getAttribute('data-type');
			let dataDir = this.getAttribute('data-dir');
			getData(dataString, dataType, null, dataDir).then(function (value) {
				newData = value;
			}).finally(() => { this.append(handleData(newData)); });
		}
	}
}

// Class for generating a primary content module 
export class EmpacContent extends HTMLElement {
	constructor() {
		super();
	}
	connectedCallback() {
		// Set component based on data
		let newData;

		if (this.getAttribute('data') != undefined) {
			let dataString = this.getAttribute('data');
			let dataType = this.getAttribute('data-type');
			let subType = this.getAttribute('data-subtype');
			let dataDir = this.getAttribute('data-dir');
			getData(dataString, dataType, null, dataDir).then(function (value) {
				newData = value;
			}).finally(() => { this.append(handleData(newData[subType])); });
		}
	}
}