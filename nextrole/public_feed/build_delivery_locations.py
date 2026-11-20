import re,unicodedata
CITIES={'Bengaluru':['Bangalore','Whitefield','Electronic City','Hosur'],'Hyderabad':['Secunderabad','Cyberabad','Gachibowli'],'Pune':['Pimpri','Chinchwad'],'Chennai':['Madras','Tambaram','Sriperumbudur'],'Mumbai':['Bombay','Navi Mumbai','Thane','Panvel'],'Gurugram':['Gurgaon'],'Noida':['Greater Noida'],'New Delhi':['Delhi'],'Kolkata':['Calcutta','Salt Lake','New Town'],'Kochi':['Cochin','Kakkanad'],'Thiruvananthapuram':['Trivandrum'],'Ahmedabad':[],'Chandigarh':['Mohali','Panchkula'],'Coimbatore':[],'Indore':[],'Jaipur':[],'Bhubaneswar':[]}

def slug(city):return city.lower().replace(' ','-')
def norm(text):return ''.join(c for c in unicodedata.normalize('NFKD',str(text)) if not unicodedata.combining(c)).lower()

def specific_city(location):
 return any(re.search(r'(?<![a-z])'+re.escape(norm(alias))+r'(?![a-z])',norm(location)) for city,aliases in CITIES.items() for alias in [city,*aliases])
