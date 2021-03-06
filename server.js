'use strict';

require('dotenv').config();
const express = require('express');
const superagent = require('superagent');
const app = express();
const cors = require('cors');
app.use(cors());

const PORT = process.env.PORT || 3000;

const pg = require('pg');

const dbClient = new pg.Client(process.env.DATABASE_URL);

dbClient.connect(error => {
  
  if (error) {
    console.log('Something went wrong with the Database: ' + error);
  } else {
    console.log('Connected to database');
  }
});

function Location (city, obj) {
  this.search_query = city;
  this.formated_query = obj.display_name;
  this.latitude = obj.lat;
  this.longitude = obj.lon;
}

function Weather(date, weatherDescription) {
  this.time = new Date(date).toDateString();
  this.forecast = weatherDescription;
}

function Trail(item) {
  this.name = item.name;
  this.location = item.location;
  this.length = item.length;
  this.stars = item.stars;
  this.star_votes = item.starVotes;
  this.summary = item.summary;
  this.trail_url = item.url;
  this.conditions = item.conditionDetails;
  this.condition_date = item.conditionDate.slice(0, 10);
  this.condition_time = item.conditionDate.slice(11, 19);
}

function Business(item) {
  this.name = item.name;
  this.image_url = item.image_url;
  this.price = item.price;
  this.rating = item.rating;
  this.url = item.url;
}

function Movie(item) {
  this.title = item.title;
  this.overview = item.overview;
  this.average_votes = item.vote_average;
  this.total_votes = item.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/w500${item.backdrop_path}`;
  this.popularity = item.popularity;
  this.released_on = item.release_date;
}

function errorHandler(error, request, response) {
  response.status(500).send('something went wrong: ' + error);
}

function declaredLocationResponse(locationResponse, response, cityQuery) {
  const data = locationResponse.body[0];
  const location = new Location(cityQuery, data);
  let insertSQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING *;`;
  let insertValues = [cityQuery, location.format_query , location.latitude, location.longitude];
  dbClient.query(insertSQL, insertValues);
  response.status(200).send(location);
}

function handleLocation(request, response) {

  let cityQuery = request.query.city;
  const key = process.env.LOCATIONIQ_API_KEY;
  const url = `https://us1.locationiq.com/v1/search.php?key=${key}&q=${cityQuery}&format=json&limit=1`;
  
  let searchSQL = `SELECT * FROM locations WHERE search_query=$1;`;
  let searchValue = [cityQuery];

  dbClient.query(searchSQL, searchValue)
    .then(sqlResults => {
      if (sqlResults.rows[0]) {
        response.status(200).send(new Location(cityQuery, sqlResults.rows[0]))
        console.log('sql message')
      } else {
        superagent.get(url)
          .then(locationResponse => {
            declaredLocationResponse(locationResponse, response, cityQuery);
          })
          .catch(error => { errorHandler(error, request, response) });
      }
    })
    .catch(error => { errorHandler(error, request, response) });
}

app.get('/location', handleLocation);

function declaredWeatherResponse(weatherResponse, response) {
  const data = weatherResponse.body.data;
  const newWeatherArray = [];
  data.forEach(item => {
    newWeatherArray.push(new Weather(item.datetime, item.weather.description))
  });
  response.send(newWeatherArray);
}

function handleWeather(request, response) {
  const key = process.env.WEATHERBIT_API_KEY;
  const latitude = request.query.latitude;
  const longitude = request.query.longitude;
  const url = `https://api.weatherbit.io/v2.0/forecast/daily?lat=${latitude}&lon=${longitude}&key=${key}`;

  superagent.get(url)
    .then(weatherResponse => {declaredWeatherResponse(weatherResponse, response)
    }).catch( error => { errorHandler(error, request, response) });
}


app.get('/weather', handleWeather);

function declaredTrailResponse(trailsResponse, response) {
  const extractedTrails = trailsResponse.body.trails;
  let localTrailArrayResult = extractedTrails.map(item => {
    return new Trail(item);
  });
  response.status(200).send(localTrailArrayResult);
}

function handleTrail(request, response) {
  const key = process.env.TRAILS_API_KEY;
  const latitude = request.query.latitude;
  const longitude = request.query.longitude;
  const url = `https://www.hikingproject.com/data/get-trails?lat=${latitude}&lon=${longitude}&maxDistance=10&key=${key}`;
  console.log(url);

  superagent.get(url)
    .then(trailsResponse => {
      declaredTrailResponse(trailsResponse, response);
    })
    .catch( error => { errorHandler(error, request, response) });
}

app.get( '/trails', handleTrail);

function declaredMovieResponse(movieResponse, response) {
  let movieResults = movieResponse.body.results;
  let movieDisplayed = movieResults.map(item => {
    return new Movie(item);
  });
  response.status(200).send(movieDisplayed);
}

function handleMovie(request, response) {
  const key = process.env.MOVIE_API_KEY;
  let cityQuery = request.query.search_query;
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${cityQuery}`;

  superagent.get(url)
    .then(movieResponse => {declaredMovieResponse(movieResponse, response);
    }).catch( error => { errorHandler(error, request, response) });
}

app.get( '/movies', handleMovie);

function declaredYelpResponse(yelpResponse, response) {
  const results = yelpResponse.body.businesses.map(item => new Business(item));
  response.send(results);
}


function handleYelp(request, response) {
  const cityQuery = request.query.city;
  let url = `http://api.yelp.com/v3/businesses/search?location=${cityQuery}&term=restaurants`;
  superagent.get(url)
    .set({
      "Authorization": `Bearer ${process.env.YELP_API_KEY}`
    })
    .then(yelpResponse => {
      declaredYelpResponse(yelpResponse, response);
    })
    .catch((error) => {
      response.send('Something is wrong: ' + error);
    });
}

app.get( '/yelp', handleYelp);

app.get('*', (request, response) => {
  response.status(404).send('sorry something is wrong');
});


app.listen(PORT, () => {console.log('Application is running on PORT: ' + PORT);});
