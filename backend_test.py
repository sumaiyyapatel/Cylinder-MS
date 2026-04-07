#!/usr/bin/env python3
"""
Gas Cylinder Management System - Backend API Testing
Tests all API endpoints with proper authentication and role-based access
"""

import requests
import sys
import json
from datetime import datetime, timedelta

class GasCylinderAPITester:
    def __init__(self, base_url="https://cylinder-flow-hub.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.operator_token = None
        self.accountant_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_result(self, test_name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name}")
        else:
            print(f"❌ {test_name} - {details}")
            self.failed_tests.append({"test": test_name, "error": details})

    def make_request(self, method, endpoint, token=None, data=None, expected_status=200):
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            return success, response.status_code, response.json() if response.content else {}

        except requests.exceptions.RequestException as e:
            return False, 0, {"error": str(e)}
        except json.JSONDecodeError:
            return False, response.status_code, {"error": "Invalid JSON response"}

    def test_health_endpoints(self):
        """Test basic health endpoints"""
        print("\n🔍 Testing Health Endpoints...")
        
        # Test root endpoint
        success, status, data = self.make_request('GET', '')
        self.log_result("GET /api/ (root endpoint)", success and "Gas Cylinder Management System API" in str(data))
        
        # Test health endpoint
        success, status, data = self.make_request('GET', 'health')
        self.log_result("GET /api/health", success and data.get('status') == 'ok')

    def test_authentication(self):
        """Test authentication endpoints"""
        print("\n🔍 Testing Authentication...")
        
        # Test admin login
        success, status, data = self.make_request('POST', 'auth/login', data={
            "username": "admin",
            "password": "admin123"
        })
        if success and data.get('token'):
            self.admin_token = data['token']
            self.log_result("Admin login (admin/admin123)", True)
        else:
            self.log_result("Admin login (admin/admin123)", False, f"Status: {status}, Data: {data}")

        # Test operator login
        success, status, data = self.make_request('POST', 'auth/login', data={
            "username": "operator",
            "password": "op123"
        })
        if success and data.get('token'):
            self.operator_token = data['token']
            self.log_result("Operator login (operator/op123)", True)
        else:
            self.log_result("Operator login (operator/op123)", False, f"Status: {status}, Data: {data}")

        # Test accountant login
        success, status, data = self.make_request('POST', 'auth/login', data={
            "username": "accounts",
            "password": "acc123"
        })
        if success and data.get('token'):
            self.accountant_token = data['token']
            self.log_result("Accountant login (accounts/acc123)", True)
        else:
            self.log_result("Accountant login (accounts/acc123)", False, f"Status: {status}, Data: {data}")

        # Test invalid login
        success, status, data = self.make_request('POST', 'auth/login', data={
            "username": "admin",
            "password": "wrongpass"
        }, expected_status=401)
        self.log_result("Invalid login should fail", success)

        # Test /me endpoint with admin token
        if self.admin_token:
            success, status, data = self.make_request('GET', 'auth/me', token=self.admin_token)
            self.log_result("GET /api/auth/me with admin token", success and data.get('role') == 'ADMIN')

    def test_dashboard_api(self):
        """Test dashboard API"""
        print("\n🔍 Testing Dashboard API...")
        
        if not self.admin_token:
            self.log_result("Dashboard API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'dashboard', token=self.admin_token)
        if success:
            # Check if stats object exists
            stats_exist = 'stats' in data
            self.log_result("Dashboard API returns stats", stats_exist)
        else:
            self.log_result("Dashboard API", False, f"Status: {status}, Data: {data}")

    def test_customers_api(self):
        """Test customers CRUD operations"""
        print("\n🔍 Testing Customers API...")
        
        if not self.admin_token:
            self.log_result("Customers API (no token)", False, "Admin token not available")
            return

        # Get customers list
        success, status, data = self.make_request('GET', 'customers', token=self.admin_token)
        self.log_result("GET /api/customers", success and 'data' in data)
        
        if success and data.get('data'):
            customers_count = len(data['data'])
            self.log_result(f"Customers list contains {customers_count} customers", customers_count >= 5)

        # Test customer creation with valid area code
        # First get available areas
        success, status, areas_data = self.make_request('GET', 'areas', token=self.admin_token)
        if success and isinstance(areas_data, list) and areas_data:
            valid_area_code = areas_data[0].get('areaCode', 'B')
        elif success and isinstance(areas_data, dict) and 'data' in areas_data and areas_data['data']:
            valid_area_code = areas_data['data'][0].get('areaCode', 'B')
        else:
            valid_area_code = 'B'  # Default fallback
            
        new_customer = {
            "code": "TST01",
            "name": "Test Customer",
            "city": "Test City",
            "areaCode": valid_area_code
        }
        success, status, data = self.make_request('POST', 'customers', token=self.admin_token, 
                                                data=new_customer, expected_status=201)
        if success:
            self.log_result("Create new customer", True)
            customer_id = data.get('id')
            
            # Test get specific customer
            if customer_id:
                success, status, data = self.make_request('GET', f'customers/{customer_id}', token=self.admin_token)
                self.log_result(f"GET customer by ID {customer_id}", success and data.get('code') == 'TST01')
        else:
            self.log_result("Create new customer", False, f"Status: {status}, Data: {data}")

    def test_cylinders_api(self):
        """Test cylinders API"""
        print("\n🔍 Testing Cylinders API...")
        
        if not self.admin_token:
            self.log_result("Cylinders API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'cylinders', token=self.admin_token)
        self.log_result("GET /api/cylinders", success and 'data' in data)
        
        if success and data.get('data'):
            cylinders_count = len(data['data'])
            self.log_result(f"Cylinders list contains {cylinders_count} cylinders", cylinders_count >= 8)

    def test_gas_types_api(self):
        """Test gas types API"""
        print("\n🔍 Testing Gas Types API...")
        
        if not self.admin_token:
            self.log_result("Gas Types API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'gas-types', token=self.admin_token)
        self.log_result("GET /api/gas-types", success)
        
        if success:
            # Handle both list and object responses
            if isinstance(data, list):
                gas_types_count = len(data)
                self.log_result(f"Gas types list contains {gas_types_count} gas types", gas_types_count >= 5)
            elif isinstance(data, dict) and 'data' in data:
                gas_types_count = len(data['data'])
                self.log_result(f"Gas types list contains {gas_types_count} gas types", gas_types_count >= 5)

    def test_areas_api(self):
        """Test areas API"""
        print("\n🔍 Testing Areas API...")
        
        if not self.admin_token:
            self.log_result("Areas API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'areas', token=self.admin_token)
        self.log_result("GET /api/areas", success)
        
        if success:
            # Handle both list and object responses
            if isinstance(data, list):
                areas_count = len(data)
                self.log_result(f"Areas list contains {areas_count} areas", areas_count >= 5)
            elif isinstance(data, dict) and 'data' in data:
                areas_count = len(data['data'])
                self.log_result(f"Areas list contains {areas_count} areas", areas_count >= 5)

    def test_rate_list_api(self):
        """Test rate list API"""
        print("\n🔍 Testing Rate List API...")
        
        if not self.admin_token:
            self.log_result("Rate List API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'rate-list', token=self.admin_token)
        self.log_result("GET /api/rate-list", success)
        
        if success:
            # Handle both list and object responses
            if isinstance(data, list):
                rates_count = len(data)
                self.log_result(f"Rate list contains {rates_count} rates", rates_count >= 3)
            elif isinstance(data, dict) and 'data' in data:
                rates_count = len(data['data'])
                self.log_result(f"Rate list contains {rates_count} rates", rates_count >= 3)

    def test_transactions_api(self):
        """Test transactions API (Bill Cum Challan)"""
        print("\n🔍 Testing Transactions API...")
        
        if not self.admin_token:
            self.log_result("Transactions API (no token)", False, "Admin token not available")
            return

        # Get transactions list
        success, status, data = self.make_request('GET', 'transactions', token=self.admin_token)
        self.log_result("GET /api/transactions", success and 'data' in data)

        # Test next bill number generation
        success, status, data = self.make_request('GET', 'transactions/next-bill-number', token=self.admin_token)
        self.log_result("GET next bill number", success and 'billNumber' in data)

    def test_ecr_api(self):
        """Test ECR API"""
        print("\n🔍 Testing ECR API...")
        
        if not self.admin_token:
            self.log_result("ECR API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'ecr', token=self.admin_token)
        self.log_result("GET /api/ecr", success and 'data' in data)

    def test_challans_api(self):
        """Test challans API"""
        print("\n🔍 Testing Challans API...")
        
        if not self.admin_token:
            self.log_result("Challans API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'challans', token=self.admin_token)
        self.log_result("GET /api/challans", success and 'data' in data)

    def test_ledger_api(self):
        """Test ledger API"""
        print("\n🔍 Testing Ledger API...")
        
        if not self.admin_token:
            self.log_result("Ledger API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'ledger', token=self.admin_token)
        self.log_result("GET /api/ledger", success and 'data' in data)

    def test_reports_api(self):
        """Test reports API"""
        print("\n🔍 Testing Reports API...")
        
        if not self.admin_token:
            self.log_result("Reports API (no token)", False, "Admin token not available")
            return

        # Test holding statement
        success, status, data = self.make_request('GET', 'reports/holding-statement', token=self.admin_token)
        self.log_result("GET /api/reports/holding-statement", success)

        # Test daily report
        success, status, data = self.make_request('GET', 'reports/daily', token=self.admin_token)
        self.log_result("GET /api/reports/daily", success)

        # Test trial balance
        success, status, data = self.make_request('GET', 'reports/trial-balance', token=self.admin_token)
        self.log_result("GET /api/reports/trial-balance", success)

    def test_settings_api(self):
        """Test settings API"""
        print("\n🔍 Testing Settings API...")
        
        if not self.admin_token:
            self.log_result("Settings API (no token)", False, "Admin token not available")
            return

        success, status, data = self.make_request('GET', 'settings', token=self.admin_token)
        self.log_result("GET /api/settings", success)

        # Test GST rates
        success, status, data = self.make_request('GET', 'settings/gst-rates', token=self.admin_token)
        self.log_result("GET /api/settings/gst-rates", success and 'data' in data)

    def test_users_api(self):
        """Test users API (admin only)"""
        print("\n🔍 Testing Users API...")
        
        if not self.admin_token:
            self.log_result("Users API (no token)", False, "Admin token not available")
            return

        # Test with admin token (should work)
        success, status, data = self.make_request('GET', 'users', token=self.admin_token)
        self.log_result("GET /api/users (admin access)", success and 'data' in data)

        # Test with operator token (should fail)
        if self.operator_token:
            success, status, data = self.make_request('GET', 'users', token=self.operator_token, expected_status=403)
            self.log_result("GET /api/users (operator access denied)", success)

    def test_role_based_access(self):
        """Test role-based access control"""
        print("\n🔍 Testing Role-Based Access Control...")
        
        if not self.operator_token:
            self.log_result("Role-based access test (no operator token)", False, "Operator token not available")
            return

        # Operator should NOT be able to access user management
        success, status, data = self.make_request('GET', 'users', token=self.operator_token, expected_status=403)
        self.log_result("Operator cannot access user management", success)

        # Operator should be able to access customers
        success, status, data = self.make_request('GET', 'customers', token=self.operator_token)
        self.log_result("Operator can access customers", success)

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting Gas Cylinder Management System API Tests")
        print(f"📍 Testing API at: {self.base_url}")
        print("=" * 60)

        # Run test suites
        self.test_health_endpoints()
        self.test_authentication()
        self.test_dashboard_api()
        self.test_customers_api()
        self.test_cylinders_api()
        self.test_gas_types_api()
        self.test_areas_api()
        self.test_rate_list_api()
        self.test_transactions_api()
        self.test_ecr_api()
        self.test_challans_api()
        self.test_ledger_api()
        self.test_reports_api()
        self.test_settings_api()
        self.test_users_api()
        self.test_role_based_access()

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print(f"\n❌ Failed Tests ({len(self.failed_tests)}):")
            for test in self.failed_tests:
                print(f"  • {test['test']}: {test['error']}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\n✨ Success Rate: {success_rate:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test runner"""
    tester = GasCylinderAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())