// Functions for Empac.co
/** Built by Britton Lorentzen [brittonlorentzen@gmail.com, blorentz.com] */

// Function that toggles the navigation menu
function toggleNav() {



}

// Functions that handle modal opening/closing
function openModal(theModal) {
	theModal.showModal();

	// Set up booking widget
	if (theModal.getAttribute('ejs-modal') == 'booking-widget') {
		let widgetContainer = theModal.querySelector('[booking]')
		theModal.appendChild(generateModalLoader());
		widgetContainer.appendChild(returnBookingScript());
		setTimeout(() => {
			if (theModal.querySelector('iframe') != null) {
				widgetContainer.querySelector('iframe').onload = () => {
					theModal.querySelector('.modal-loader').classList.toggle('inactive');
					setTimeout(() => {
						theModal.querySelector('.modal-loader').style.display = 'none';
					}, 1000)
				}
			}
		}, 1000);
	}

	theModal.addEventListener('click', (e) => {
		let myBoundary = theModal.querySelector('.modal-window').getBoundingClientRect();
		let xPos = e.clientX;
		let yPos = e.clientY;

		if (xPos < myBoundary.left || xPos > myBoundary.right || yPos < myBoundary.top || yPos > myBoundary.bottom) {
			closeModal(theModal);
		}
	});
}

function closeModal(theModal) {
	theModal.close();
	if (theModal.getAttribute('ejs-modal') == 'booking-widget') {
		setTimeout(() => {
			theModal.querySelector('[booking]').innerHTML = '';
		}, 500);
		theModal.querySelector('.modal-loader').remove();
	}
	theModal.removeEventListener('click', () => { });
}

// Function that generates a loader for modals
function generateModalLoader() {
	let myLoader = document.createElement('div');
	myLoader.classList.add('modal-loader');
	myLoader.appendChild(document.createElement('span'));

	let img = document.createElement('img');
	img.setAttribute('alt', 'empac');
	img.setAttribute('size', 'small');
	img.src = '/files/images/icons/company/black/empac-emblem.svg';

	myLoader.appendChild(img);

	return myLoader;
}

// Create intersection listener
function createIntersection() {
	// Set threshold for listener
	let myLimit;
	if (window.innerWidth < 640) { myLimit = 0.05; }
	if (window.innerWidth >= 640) { myLimit = 0.1; }

	let observer = new IntersectionObserver((entries, observer) => {
		entries.forEach(entry => {
			if (entry.isIntersecting) {
				if (entry.target.hasAttribute('delay') && window.innerWidth > 639) {
					setTimeout(() => { entry.target.classList.toggle('active'); }, entry.target.getAttribute('delay'))
				} else {
					entry.target.classList.toggle('active');
				}
				observer.unobserve(entry.target);
			}
		});
	}, { rootMargin: "0px", threshold: myLimit });

	return observer;
}

// Function that handles the play/pause of a video
function playVideo(theVideoSection) {
	let myButton = theVideoSection.querySelector('[video-button]');
	let myVideo = theVideoSection.querySelector('video');
	if (myVideo.paused) {
		myVideo.play();
		myVideo.setAttribute('controls', true);
		theVideoSection.classList.toggle('active');
		setTimeout(() => { myButton.style.display = 'none' }, 275);
	}
}

// Function that returns CSS properties and values as an array
function getCSSProps(theEl) {
	let propList = [];
	let myContainer = document.getElementById(theEl);
	for (let i = 0; i < myContainer.style.length; i++) {
		let newObj = {};
		let style = myContainer.style[i];
		newObj.key = style;
		newObj.value = myContainer.style.getPropertyValue(style);
		propList.push(newObj);
	}
	return propList;
}

// Function that returns tag attributes and calues as an array
function getTagAttributes(theEl) {
	let attrList = [];
	let myContainer = document.getElementById(theEl);
	let myAttrs = myContainer.getAttributeNames();
	for (let i = 0; i < myAttrs.length; i++) {
		let newObj = {};
		newObj.key = myAttrs[i];
		newObj.value = myContainer.getAttribute(myAttrs[i]);
		attrList.push(newObj);
	}
	return attrList;
}

// Function that retrieves code for samples
async function retrieveCode(theSample, theType, theDir) {
	let url = '/files/js/empacjs/json/';

	// Grab main code type
	if (theType != undefined) { url += theType; url += '/' }
	else { url += 'modules/' };

	// Get sub directory if applicable
	if (theDir != undefined) { url += theDir; url += '/' };

	url += theSample;
	url += '.json';
	let request = new Request(url);
	let response = await fetch(request);
	return await response.json();
}

async function getMKData() {
	let url = '/files/empacjs/json/apps/mk8dx-data.json';
	let request = new Request(url);
	let response = await fetch(request);
	return await response.json();
}

function getRandomNumber(myMax) {
	return Math.floor(Math.random() * myMax);
}

function randomizeKarts() {
	let myCharacters = mkData.characters;
	let myVehicles = mkData.vehicles;
	let myWheels = mkData.wheels;
	let myGliders = mkData.gliders;

	// Find Section and Assign Values
	let mySection = document.querySelectorAll('[ejs-type="randomizer"]').forEach(randomizer => {

		// Set triggers
		let charTrigger = false;
		let vehiTrigger = false;
		document.querySelectorAll('[ejs-for="char-filtering"] button').forEach(charBtn => {
			if (charBtn.classList.contains('active')) { charTrigger = true; }
		});
		document.querySelectorAll('[ejs-for="vehi-filtering"] button').forEach(vehiBtn => {
			if (vehiBtn.classList.contains('active')) { vehiTrigger = true; }
		});

		// Get random numbers

		let charNum;
		let vehiNum;
		let wheelNum = getRandomNumber(myWheels.length);
		let gliderNum = getRandomNumber(myGliders.length);

		let charSection = randomizer.querySelector('[ejs-subtype="characters"]');
		let vehiSection = randomizer.querySelector('[ejs-subtype="vehicles"]');
		let wheelSection = randomizer.querySelector('[ejs-subtype="wheels"]');
		let gliderSection = randomizer.querySelector('[ejs-subtype="gliders"]');

		if (charTrigger) {
			charNum = getRandomNumber(mkChars.length);
			charSection.querySelector('img').src = mkChars[charNum].img;
			charSection.querySelector('span').innerText = mkChars[charNum].name;
		}
		else {
			charNum = getRandomNumber(myCharacters.length);
			charSection.querySelector('img').src = mkData.characters[charNum].img;
			charSection.querySelector('span').innerText = mkData.characters[charNum].name;
		}

		if (vehiTrigger) {
			vehiNum = getRandomNumber(mkVehis.length);
			vehiSection.querySelector('img').src = mkVehis[vehiNum].img;
			vehiSection.querySelector('span').innerText = mkVehis[vehiNum].name;
		}
		else {
			vehiNum = getRandomNumber(myVehicles.length);
			vehiSection.querySelector('img').src = mkData.vehicles[vehiNum].img;
			vehiSection.querySelector('span').innerText = mkData.vehicles[vehiNum].name;
		}

		wheelSection.querySelector('img').src = mkData.wheels[wheelNum].img;
		gliderSection.querySelector('img').src = mkData.gliders[gliderNum].img;

		wheelSection.querySelector('span').innerText = mkData.wheels[wheelNum].name;
		gliderSection.querySelector('span').innerText = mkData.gliders[gliderNum].name;

	});

	plausible('Randomize Karts');

}

function refreshKart(theIndex) {
	let myCharacters = mkData.characters;
	let myVehicles = mkData.vehicles;
	let myWheels = mkData.wheels;
	let myGliders = mkData.gliders;

	// Set triggers
	let charTrigger = false;
	let vehiTrigger = false;
	document.querySelectorAll('[ejs-for="char-filtering"] button').forEach(charBtn => {
		if (charBtn.classList.contains('active')) { charTrigger = true; }
	});
	document.querySelectorAll('[ejs-for="vehi-filtering"] button').forEach(vehiBtn => {
		if (vehiBtn.classList.contains('active')) { vehiTrigger = true; }
	});

	// Find Section and Assign Values
	let mySection = document.querySelectorAll('[ejs-type="randomizer"]')[theIndex];

	// Get random numbers

	let charNum;
	let vehiNum;
	let wheelNum = getRandomNumber(myWheels.length);
	let gliderNum = getRandomNumber(myGliders.length);

	let charSection = mySection.querySelector('[ejs-subtype="characters"]');
	let vehiSection = mySection.querySelector('[ejs-subtype="vehicles"]');
	let wheelSection = mySection.querySelector('[ejs-subtype="wheels"]');
	let gliderSection = mySection.querySelector('[ejs-subtype="gliders"]');

	if (charTrigger) {
		charNum = getRandomNumber(mkChars.length);
		charSection.querySelector('img').src = mkChars[charNum].img;
		charSection.querySelector('span').innerText = mkChars[charNum].name;
	}
	else {
		charNum = getRandomNumber(myCharacters.length);
		charSection.querySelector('img').src = mkData.characters[charNum].img;
		charSection.querySelector('span').innerText = mkData.characters[charNum].name;
	}

	if (vehiTrigger) {
		vehiNum = getRandomNumber(mkVehis.length);
		vehiSection.querySelector('img').src = mkVehis[vehiNum].img;
		vehiSection.querySelector('span').innerText = mkVehis[vehiNum].name;
	}
	else {
		vehiNum = getRandomNumber(myVehicles.length);
		vehiSection.querySelector('img').src = mkData.vehicles[vehiNum].img;
		vehiSection.querySelector('span').innerText = mkData.vehicles[vehiNum].name;
	}

	wheelSection.querySelector('img').src = mkData.wheels[wheelNum].img;
	gliderSection.querySelector('img').src = mkData.gliders[gliderNum].img;

	wheelSection.querySelector('span').innerText = mkData.wheels[wheelNum].name;
	gliderSection.querySelector('span').innerText = mkData.gliders[gliderNum].name;

	plausible('Refresh One Kart');

}

function addRacer() {
	let mySection = document.querySelector('.randomizer-section');
	let myAmount = mySection.querySelectorAll('[ejs-type="randomizer"]').length;

	if (myAmount < 12) {

		plausible('Add Racer');

		let newRow = document.createElement('div');
		newRow.setAttribute('ejs-index', myAmount + 1);
		newRow.setAttribute('ejs-type', 'randomizer');

		// Set up player section
		let myPlayer = document.createElement('div');
		myPlayer.classList.add('player-section');

		// Set up generic item image
		let charImg = document.createElement('img');
		let bodyImg = document.createElement('img');
		let wheelImg = document.createElement('img');
		let gliderImg = document.createElement('img');

		charImg.src = '/files/images/fg/itembox.png';
		bodyImg.src = '/files/images/fg/itembox.png';
		wheelImg.src = '/files/images/fg/itembox.png';
		gliderImg.src = '/files/images/fg/itembox.png';

		let nameSection = document.createElement('div');
		nameSection.classList.add('username');

		let raceName = document.createElement('input');
		raceName.setAttribute('type', 'text');
		raceName.setAttribute('placeholder', 'Player Name');

		nameSection.append(raceName);
		myPlayer.append(nameSection);
		newRow.append(myPlayer);

		let btnGroup = document.createElement('div');
		btnGroup.classList.add('btn-group');

		let myRefresh = document.createElement('button');
		myRefresh.classList = 'refresh';
		myRefresh.innerText = 'Refresh Kart';
		myRefresh.addEventListener('click', () => { refreshKart(myRefresh.parentElement.parentElement.parentElement.getAttribute('ejs-index') - 1) });

		btnGroup.append(myRefresh);

		let myRemove = document.createElement('button');
		myRemove.classList = 'close';
		myRemove.innerText = 'Remove Player';
		myRemove.addEventListener('click', () => { removeRacer(myRemove.parentElement.parentElement.parentElement.getAttribute('ejs-index') - 1) });

		btnGroup.append(myRemove);
		myPlayer.append(btnGroup);

		//

		//
		let randomLine = document.createElement('ul');

		let charLine = document.createElement('li');
		charLine.setAttribute('ejs-subtype', 'characters');
		charLine.append(charImg);

		let charName = document.createElement('span');
		charName.innerText = '???';
		charLine.append(charName);

		randomLine.append(charLine);

		//

		let vehiLine = document.createElement('li');
		vehiLine.setAttribute('ejs-subtype', 'vehicles');
		vehiLine.append(bodyImg);

		let vehiName = document.createElement('span');
		vehiName.innerText = '???';
		vehiLine.append(vehiName);

		randomLine.append(vehiLine);

		//

		let wheelLine = document.createElement('li');
		wheelLine.setAttribute('ejs-subtype', 'wheels');
		wheelLine.append(wheelImg);

		let wheelName = document.createElement('span');
		wheelName.innerText = '???';
		wheelLine.append(wheelName);

		randomLine.append(wheelLine);

		//

		let gliderLine = document.createElement('li');
		gliderLine.setAttribute('ejs-subtype', 'gliders');
		gliderLine.append(gliderImg);

		let gliderName = document.createElement('span');
		gliderName.innerText = '???';
		gliderLine.append(gliderName);

		randomLine.append(gliderLine);
		newRow.append(randomLine);

		//

		mySection.append(newRow);

	} else { console.log('Already at max racers!') };
}

function removeRacer(theIndex) {
	let mySections = document.querySelectorAll('[ejs-type="randomizer"]');
	let myNum = 0;
	if (mySections.length > 1) {
		plausible('Remove Racer');
		mySections[theIndex].remove();
		document.querySelectorAll('[ejs-type="randomizer"]').forEach(section => {
			section.setAttribute('ejs-index', myNum + 1);
			myNum++;
		});
	} else { console.log('Only one racer is left!') };
}

function randomizeRaces(myValue) {
	let myRaceList = document.querySelector('[ejs-type="track-randomizer"] ul');
	myRaceList.innerHTML = '';

	mkChoice = [];
	let newCup;
	let newRace;

	// Set up races
	if (myValue >= 1) {
		for (let i = 0; i < myValue; i++) {
			let validator = false;
			newCup = getRandomNumber(mkData.cups.length);
			newRace = getRandomNumber(mkData.cups[newCup].courses.length);

			while (!validator) {
				// First pass for dups
				if (document.querySelector('[ejs-for="track-filtering"] [ejs-filter="no-dups"]').classList.contains('active')) {
					while (mkChoice.includes(mkData.cups[newCup].courses[newRace].name)) {
						console.log('Duplicate found! Reshuffle.');
						newCup = getRandomNumber(mkData.cups.length);
						newRace = getRandomNumber(mkData.cups[newCup].courses.length);
					}
				}

				// Pass for tour tracks
				if (document.querySelector('[ejs-for="track-filtering"] [ejs-filter="all-tour"]').classList.contains('active')) {
					while (mkData.cups[newCup].courses[newRace].type != 'Tour') {
						console.log('Not a tour track! Reshuffle.');
						newCup = getRandomNumber(mkData.cups.length);
						newRace = getRandomNumber(mkData.cups[newCup].courses.length);
						// Last pass for dup
						if (mkChoice.includes(mkData.cups[newCup].courses[newRace].name) && document.querySelector('[ejs-for="track-filtering"] [ejs-filter="no-dups"]').classList.contains('active')) {
							console.log('It is a duplicate tour though! Reshuffle.');
							newCup = getRandomNumber(mkData.cups.length);
							newRace = getRandomNumber(mkData.cups[newCup].courses.length);
							continue;
						}
					}
				}

				// Validated
				console.log('Race Validated');
				mkChoice.push(mkData.cups[newCup].courses[newRace].name);
				validator = true;
			}

			// Set up new line item
			let newRaceLine = document.createElement('li');
			let raceNumberEl = document.createElement('span');
			let raceNumber = i + 1;
			raceNumberEl.innerText = 'Race ' + raceNumber;
			newRaceLine.append(raceNumberEl);

			let raceImg = document.createElement('img');
			raceImg.src = mkData.cups[newCup].courses[newRace].img;
			newRaceLine.append(raceImg);

			let cupImg = document.createElement('img');
			cupImg.src = mkData.cups[newCup].img;
			newRaceLine.append(cupImg);

			// Append items
			myRaceList.append(newRaceLine);
		}
		plausible('Randomize Races', { props: { amount: myValue } });
	} else { console.log('Need to select the amount of races being ran.') }
}

function filterChars() {
	mkChars = [];
	let myFilters = '';
	document.querySelectorAll('[ejs-for="char-filtering"] button').forEach(filter => {
		if (filter.classList.contains('active')) {
			myFilters += filter.getAttribute('ejs-filter');
			myFilters += ' '
			let newChars = [];
			mkData.characters.forEach(char => {
				if (char.weight == filter.getAttribute('ejs-filter')) { newChars.push(char) }
			});
			mkChars.push(...newChars);
		}
	});
	plausible('Filter Characters', { props: { type: myFilters } });
}

function filterVehis() {
	mkVehis = [];
	let myFilters = '';
	document.querySelectorAll('[ejs-for="vehi-filtering"] button').forEach(filter => {
		if (filter.classList.contains('active')) {
			myFilters += filter.getAttribute('ejs-filter');
			myFilters += ' '
			let newVehis = [];
			mkData.vehicles.forEach(vehi => {
				if (vehi.drift == filter.getAttribute('ejs-filter')) { newVehis.push(vehi) }
			});
			mkVehis.push(...newVehis);
		}
	});
	plausible('Filter Vehicles', { props: { type: myFilters } });
}

// Test for getting IP address

async function getClientIP() {
	fetch('https://ipapi.co/json/')
		.then(function (response) {
			response.json().then(jsonData => {
				console.log(jsonData);
			});
		})
		.catch(function (error) {
			console.log(error)
		});
}

function toggleRandomizer(theBtn) {
	theBtn.parentElement.querySelectorAll('button').forEach(btn => {
		if (btn.classList.contains('active')) {
			btn.classList.remove('active');
			let tempSection = '.' + btn.getAttribute('ejs-toggle');
			document.querySelector(tempSection).style.display = 'none';
		}
	});
	theBtn.classList.add('active');
	let openSection = '.' + theBtn.getAttribute('ejs-toggle');
	document.querySelector(openSection).style.display = 'grid';
}

// Function for generating races

function generateRaces() {

	let myRaceList = document.querySelector('[ejs-type="tourney-mode-races"] ul');
	let currNum = myRaceList.querySelectorAll('li').length;
	let numTest = document.querySelector('[ejs-for="generate-races"] input').value;

	let myDelta = numTest - currNum;

	if (myDelta > 0) {
		for (let i = 0; i < myDelta; i++) {
			// Set up new line item
			let newRaceLine = document.createElement('li');
			let raceNumberEl = document.createElement('span');
			let raceNumber = i + 1;
			raceNumberEl.innerText = 'Race ' + raceNumber;
			newRaceLine.append(raceNumberEl);

			let raceImg = document.createElement('img');
			raceImg.src = '';
			newRaceLine.append(raceImg);

			let cupImg = document.createElement('img');
			cupImg.src = '';
			newRaceLine.append(cupImg);

			// Append items
			myRaceList.append(newRaceLine);
		}
	} else if (myDelta < 0) {
		let myUpdatedDelta = myDelta * -1;
		for (let j = 0; j < myUpdatedDelta; j++) {
			myRaceList.removeChild(myRaceList.lastChild);
		}
	}

}

// Set the document up

let mkData;
let mkChoice;
let mkChars = [];
let mkVehis = [];

window.onload = () => {

	if (document.querySelector('main[ejs-rz="mk8dx"]')) {
		getMKData().then((value) => {
			mkData = value;
		})

		if (document.querySelector('.randomizer-section') != null && !document.querySelector('body').classList.contains('card-stream')) {
			document.querySelector('[ejs-for="add-player"]').addEventListener('click', addRacer);
			document.querySelector('[ejs-type="randomizer"] button.close').addEventListener('click', () => { removeRacer(0) });
			document.querySelector('[ejs-type="randomizer"] button.refresh').addEventListener('click', () => { refreshKart(0) });
			document.querySelector('[ejs-for="randomize-karts"]').addEventListener('click', randomizeKarts);

			// Set up selection function
			document.querySelector('[ejs-for="randomize-races"]').addEventListener('click', () => {
				if (document.querySelector('.stream') != null) {
					let myInput = document.querySelector('.race-number-section .race-group input');
					randomizeRaces(myInput.value);
				} else {
					let mySelection = document.querySelector('select[name="track-amount"]');
					randomizeRaces(mySelection.value);
				}
			})
		} else {
			let myOverlay = document.querySelector('.param-overlay');

			document.querySelector('[ejs-type="randomizer"] button.refresh').addEventListener('click', () => { refreshKart(0) });
			myOverlay.style.display = "none";

			document.querySelector('.randomizer-section button.params').addEventListener('click', () => {
				if (!myOverlay.classList.contains('active')) {
					myOverlay.classList.add('active');
					setTimeout(() => { myOverlay.style.display = 'flex' }, 250)
				}
			});

			document.querySelector('.randomizer-section button.close-overlay').addEventListener('click', () => {
				myOverlay.classList.remove('active');
				setTimeout(() => { myOverlay.style.display = 'none' }, 250)
			})
		}

		document.querySelectorAll('.filters').forEach(filterSection => {
			filterSection.querySelectorAll('button').forEach(filterBtn => {
				filterBtn.addEventListener('click', () => {
					filterBtn.classList.toggle('active');
					if (filterSection.getAttribute('ejs-for') == 'char-filtering') {
						filterChars();
					}
					if (filterSection.getAttribute('ejs-for') == 'vehi-filtering') {
						filterVehis();
					}

					// Get Click Events
					if (filterBtn.getAttribute('ejs-filter') == 'no-dups') {
						plausible('Filter Races', { props: { type: 'No Duplicates' } });
					}

					if (filterBtn.getAttribute('ejs-filter') == 'all-tour') {
						plausible('Filter Races', { props: { type: 'All Tour Tracks' } });
					}
				});
			});
		});

		if (document.querySelector('.stream') != null) {
			document.querySelector('.stream nav button').addEventListener('click', () => {
				document.querySelector('.stream nav button').classList.toggle('active');
				document.querySelector('.stream .nav-container').classList.toggle('active');
				document.querySelector('.stream main').classList.toggle('active');
				document.querySelector('.stream').classList.toggle('active');
				document.querySelectorAll('.stream .nav-container .btn-group button').forEach(toggle => {
					toggle.addEventListener('click', () => { toggleRandomizer(toggle); });
				});

				// Add function to the add/subtract race counter

				document.querySelectorAll('.stream .race-group').forEach(raceGroup => {
					let myRaceNumber = raceGroup.querySelector('input');
					raceGroup.querySelectorAll('button').forEach(adjBtn => {
						if (adjBtn.getAttribute('ejs-type') == 'minus') {
							adjBtn.addEventListener('click', () => {
								if (myRaceNumber.value > 1) { myRaceNumber.value--; }
								if (raceGroup.getAttribute('ejs-for') == 'generate-races') {
									generateRaces();
									console.log('Race amount updated.');
								}
							});
						}
						if (adjBtn.getAttribute('ejs-type') == 'plus') {
							adjBtn.addEventListener('click', () => {
								if (myRaceNumber.value < 48) { myRaceNumber.value++; }
								if (raceGroup.getAttribute('ejs-for') == 'generate-races') {
									generateRaces();
									console.log('Race amount updated.');
								}
							});
						}
					})
				})
			})

			// Add function for generating new races in tourney mode

			document.querySelector('[ejs-for="generate-races"] input').addEventListener('input', () => {
				generateRaces();
				console.log('Race amount updated.');
			});

			// Initialize tourney mode
			generateRaces();
		}

	}

	setTimeout(() => {

		// Set up observer for drop fade
		setTimeout(() => {
			let myFadeObserver = createIntersection();
			document.querySelectorAll('[anim-drop-fade]').forEach(el => { myFadeObserver.observe(el) });
		}, 1000);

	}, 1000);

}


