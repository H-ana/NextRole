export const HIRING_CITIES=['Bengaluru','Hyderabad','Pune','Chennai','Mumbai','Gurugram','Noida','New Delhi','Kolkata','Kochi','Thiruvananthapuram','Ahmedabad','Chandigarh','Coimbatore','Indore','Jaipur','Bhubaneswar'];
const ALIASES={Bengaluru:['Bangalore'],Hyderabad:['Secunderabad'],Mumbai:['Bombay','Navi Mumbai'],Gurugram:['Gurgaon'],Noida:['Greater Noida'],'New Delhi':['Delhi'],Kolkata:['Calcutta'],Kochi:['Cochin'],Thiruvananthapuram:['Trivandrum'],Chennai:['Madras']};
const foldPlace=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const hasPlace=(text,place)=>new RegExp('(^|[^a-z])'+foldPlace(place).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z])','i').test(foldPlace(text));
export function canonicalCity(value){return HIRING_CITIES.find(city=>[city,...(ALIASES[city]||[])].some(alias=>foldPlace(alias)===foldPlace(value)))||null;}
export function matchesLocation(location,city){return [city,...(ALIASES[city]||[])].some(alias=>hasPlace(location.toLowerCase(),alias));}
export function matchesCities(location,cities,remote=false){return remote||!cities.length||cities.some(city=>matchesLocation(location,city));}

// Nearby cities are opt-in; an alias is the same city, not a wider search.
const NEARBY={Mumbai:['Thane','Panvel'],Pune:['Pimpri','Chinchwad'],Bengaluru:['Electronic City','Whitefield','Hosur'],Hyderabad:['Cyberabad','Gachibowli'],Chennai:['Tambaram','Sriperumbudur'],Kolkata:['Salt Lake','New Town'],Chandigarh:['Mohali','Panchkula'],Kochi:['Kakkanad'],Gurugram:['Delhi','New Delhi','Noida','Greater Noida'],Noida:['Delhi','New Delhi','Gurugram','Gurgaon'],'New Delhi':['Gurugram','Gurgaon','Noida','Greater Noida']};
export function matchesPreferredCities(location,cities,remote=false,nearby=false){return matchesCities(location,cities,remote)||!!nearby&&cities.some(city=>(NEARBY[city]||[]).some(place=>hasPlace(location,place)));}
