export const HIRING_CITIES=['Bengaluru','Hyderabad','Pune','Chennai','Mumbai','Gurugram','Noida','New Delhi','Kolkata','Kochi','Thiruvananthapuram','Ahmedabad','Chandigarh','Coimbatore','Indore','Jaipur','Bhubaneswar'];
const ALIASES={Bengaluru:['Bangalore'],Mumbai:['Bombay','Navi Mumbai'],Gurugram:['Gurgaon'],Noida:['Greater Noida'],'New Delhi':['Delhi'],Kolkata:['Calcutta'],Kochi:['Cochin'],Thiruvananthapuram:['Trivandrum'],Chennai:['Madras']};
const hasPlace=(text,place)=>new RegExp('(^|[^a-z])'+place.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z])','i').test(text);
export function canonicalCity(value){return HIRING_CITIES.find(city=>[city,...(ALIASES[city]||[])].some(alias=>alias.toLowerCase()===String(value).toLowerCase()))||null;}
export function matchesLocation(location,city){return [city,...(ALIASES[city]||[])].some(alias=>hasPlace(location.toLowerCase(),alias));}
export function matchesCities(location,cities,remote=false){return remote||!cities.length||cities.some(city=>matchesLocation(location,city));}
