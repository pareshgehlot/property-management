import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  base = '/api';
  constructor(private http: HttpClient) {}

  private headers() {
    const token = localStorage.getItem('pm_token');
    return token ? { headers: new HttpHeaders({ 'Authorization': 'Bearer ' + token }) } : {};
  }

  login(username: string, password: string) {
    return this.http.post<any>(this.base + '/login', { username, password });
  }

  getProperties() { return this.http.get<any[]>(this.base + '/properties', this.headers()); }
  addProperty(name: string, icsUrl: string){ return this.http.post(this.base + '/properties', { name, icsUrl }, this.headers()); }
  deleteProperty(id: string){ return this.http.delete(this.base + `/properties/${id}`, this.headers()); }
  updateProperty(id: string, name: string, icsUrl: string){ return this.http.put(this.base + `/properties/${id}`, { name, icsUrl }, this.headers()); }
  refreshProperty(id: string){ return this.http.post(this.base + `/properties/${id}/refresh`, {}, this.headers()); }
  getBookings(id: string, from?: string, to?: string){
    let q = '';
    if(from || to) q = `?from=${from||''}&to=${to||''}`;
    return this.http.get<any>(this.base + `/properties/${id}/bookings${q}`, this.headers());
  }

  // User Management APIs
  getUserInfo() { return this.http.get<any>(this.base + '/me', this.headers()); }
  getUsers() { return this.http.get<any[]>(this.base + '/users', this.headers()); }
  createUser(username: string, password: string, accessibleProperties: string[]) { 
    return this.http.post(this.base + '/users', { username, password, accessibleProperties }, this.headers()); 
  }
  updateUserAccess(userId: string, accessibleProperties: string[]) { 
    return this.http.put(this.base + `/users/${userId}`, { accessibleProperties }, this.headers()); 
  }
  deleteUser(userId: string) { 
    return this.http.delete(this.base + `/users/${userId}`, this.headers()); 
  }
}
