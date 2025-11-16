import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/**
 * @summary Customer Service – Manages operations for Customer entity.
 */
@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer, DatabaseConnectionName.DB_MAIN)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  /**
   * @summary Create a new customer
   */
  async create(dto: CreateCustomerDto): Promise<Customer> {
    try {
      const newCustomer = this.customerRepository.create(dto);
      return await this.customerRepository.save(newCustomer);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error creating customer: ${error.message}`,
      );
    }
  }

  /**
   * @summary Get all customers
   */
  async findAll(): Promise<Customer[]> {
    try {
      return await this.customerRepository.find({
        relations: ['company', 'state', 'municipality', 'parish'],
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Error retrieving customers: ${error.message}`,
      );
    }
  }

  /**
   * @summary Get one customer by ID
   */
  async findOne(id: number): Promise<Customer> {
    try {
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['company', 'state', 'municipality', 'parish', 'videos'],
      });

      if (!customer) {
        throw new NotFoundException(`Customer with ID ${id} not found`);
      }

      return customer;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Error retrieving customer: ${error.message}`,
      );
    }
  }

  /**
   * @summary Update a customer
   */
  async update(id: number, dto: UpdateCustomerDto): Promise<Customer> {
    try {
      const customer = await this.findOne(id);
      Object.assign(customer, dto);

      return await this.customerRepository.save(customer);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error updating customer: ${error.message}`,
      );
    }
  }

  /**
   * @summary Remove a customer
   */
  async remove(id: number): Promise<void> {
    try {
      const customer = await this.findOne(id);
      await this.customerRepository.remove(customer);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error deleting customer: ${error.message}`,
      );
    }
  }
}
